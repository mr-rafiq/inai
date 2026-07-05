"""FastAPI app (F2, F15, F16, F19) — Inai backend.

History is persisted to <data_dir>/history.json so conversations survive
restarts and memory nodes can link back to their source message.

Endpoints:
  GET  /health                 health check
  GET  /api/config             public (secret-free) config + provider status
  POST /api/chat               non-streaming turn (collects two-tier events)
  GET  /api/graph              full memory graph (F11)
  PATCH/DELETE /api/graph/nodes/{id}   manual edit/delete (F14)
  GET  /api/history            conversation history (F19)
  WS   /ws                     streaming two-tier responses (F16, F18)
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import Config, load_config, save_config, UPDATABLE_FIELDS
from .llm.client import get_llm_client, MockLLMClient, LLMConfigError, LLMClient, friendly_llm_error
from .llm.catalog import list_models
from .brain.store import get_graph_store, GraphStore
from .brain.ingest import ingest
from .agent.orchestrator import Orchestrator

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("inai")


class ChatIn(BaseModel):
    message: str
    session_id: str | None = None


class NodePatch(BaseModel):
    name: str | None = None
    type: str | None = None
    props: dict[str, Any] | None = None


class ConfigPatch(BaseModel):
    provider: str | None = None
    model: str | None = None
    fast_model: str | None = None
    api_base: str | None = None
    temperature: float | None = None
    request_timeout: int | None = None


class ProfileIn(BaseModel):
    name: str
    about: str = ""


class HistoryStore:
    """Session-based conversation history persisted as JSON (F19).

    Multiple chat sessions share the ONE memory graph — sessions organize
    conversations, the brain stays global.
    """

    def __init__(self, path):
        self.path = path
        self.data: dict[str, Any] = {"sessions": [], "turns": {}}
        if path.is_file():
            try:
                loaded = json.loads(path.read_text())
                if isinstance(loaded, list):  # migrate pre-sessions format
                    sid = uuid.uuid4().hex[:12]
                    self.data = {
                        "sessions": [{"id": sid, "title": "Chat 1"}],
                        "turns": {sid: loaded},
                    }
                else:
                    self.data = loaded
            except json.JSONDecodeError:
                log.warning("history file corrupt, starting fresh")
        # also migrate a legacy history.json sitting next to the new file
        legacy = path.parent / "history.json"
        if not self.data["sessions"] and legacy.is_file() and legacy != path:
            try:
                old = json.loads(legacy.read_text())
                if isinstance(old, list) and old:
                    sid = uuid.uuid4().hex[:12]
                    self.data = {"sessions": [{"id": sid, "title": "Chat 1"}], "turns": {sid: old}}
            except json.JSONDecodeError:
                pass
        if not self.data["sessions"]:
            self.create("New chat")

    def _flush(self) -> None:
        self.path.write_text(json.dumps(self.data, indent=1))

    def sessions(self) -> list[dict[str, Any]]:
        return [
            {**s, "count": len(self.data["turns"].get(s["id"], []))}
            for s in self.data["sessions"]
        ]

    def create(self, title: str = "New chat") -> dict[str, Any]:
        session = {"id": uuid.uuid4().hex[:12], "title": title}
        self.data["sessions"].append(session)
        self.data["turns"][session["id"]] = []
        self._flush()
        return session

    def latest_session_id(self) -> str:
        return self.data["sessions"][-1]["id"]

    def turns(self, session_id: str | None = None) -> list[dict[str, Any]]:
        sid = session_id or self.latest_session_id()
        return self.data["turns"].get(sid, [])

    def append(
        self, role: str, content: str,
        session_id: str | None = None, turn_id: str | None = None, view: dict | None = None,
    ) -> dict[str, Any]:
        sid = session_id or self.latest_session_id()
        entry: dict[str, Any] = {"id": turn_id or uuid.uuid4().hex[:12], "role": role, "content": content}
        if view:
            entry["view"] = view  # rich views survive reloads
        turns = self.data["turns"].setdefault(sid, [])
        turns.append(entry)
        # first user message names the session
        session = next((s for s in self.data["sessions"] if s["id"] == sid), None)
        if session and session["title"] in ("New chat", "") and role == "user":
            session["title"] = content[:40] + ("…" if len(content) > 40 else "")
        self._flush()
        return entry


class AppState:
    """Holds long-lived singletons; rebuildable for tests."""

    def __init__(self, cfg: Config, store: GraphStore, llm: LLMClient):
        self.cfg = cfg
        self.store = store
        self.llm = llm
        self.orchestrator = Orchestrator(store, llm, cfg)
        self.history = HistoryStore(cfg.resolved_data_dir / "sessions.json")


def _build_llm(cfg: Config) -> LLMClient:
    """Resolve the LLM client with graceful degradation to a clear message."""
    try:
        return get_llm_client(cfg)
    except LLMConfigError as exc:
        log.warning("%s Falling back to offline mock client.", exc)
        return MockLLMClient(cfg)


def create_app(cfg: Config | None = None, *, llm: LLMClient | None = None) -> FastAPI:
    cfg = cfg or load_config()
    store = get_graph_store(cfg)
    store.ensure_self()
    llm = llm or _build_llm(cfg)
    state = AppState(cfg, store, llm)

    app = FastAPI(title="Inai", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "tauri://localhost"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.inai = state

    # ---- routes --------------------------------------------------------
    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "provider": state.cfg.provider,
            "model": state.cfg.model,
            "llm": state.llm.name,
            "graph_backend": type(state.store).__name__,
            "nodes": len(state.store.nodes()),
        }

    @app.get("/api/config")
    def get_config() -> dict[str, Any]:
        return state.cfg.to_public_dict()

    @app.put("/api/config")
    def update_config(patch: ConfigPatch) -> dict[str, Any]:
        """Runtime settings update (F3/F5): apply, persist, rebuild the LLM."""
        changes = {k: v for k, v in patch.model_dump(exclude_none=True).items()
                   if k in UPDATABLE_FIELDS}
        for key, val in changes.items():
            setattr(state.cfg, key, val)
        if changes:
            save_config(state.cfg)
            state.llm = _build_llm(state.cfg)
            state.orchestrator = Orchestrator(state.store, state.llm, state.cfg)
            log.info("config updated: %s -> llm=%s", changes, state.llm.name)
        return state.cfg.to_public_dict()

    @app.post("/api/config/test")
    def test_llm() -> dict[str, Any]:
        """Try one tiny completion so the UI can verify the provider works."""
        try:
            out = state.llm.complete(
                [{"role": "user", "content": "Reply with the single word: ok"}],
            )
            return {"ok": True, "llm": state.llm.name, "reply": (out or "")[:80]}
        except Exception as exc:
            return {
                "ok": False,
                "llm": state.llm.name,
                "error": friendly_llm_error(state.cfg.provider, str(exc))[:300],
            }

    @app.get("/api/models")
    def models(provider: str | None = None) -> dict[str, Any]:
        return list_models(provider or state.cfg.provider, state.cfg.api_base)

    @app.get("/api/profile")
    def get_profile() -> dict[str, Any]:
        me = state.store.ensure_self()
        return {
            "name": me.props.get("display_name", ""),
            "about": me.props.get("about", ""),
            "onboarded": bool(me.props.get("onboarded")),
        }

    @app.post("/api/profile")
    def save_profile(body: ProfileIn) -> dict[str, Any]:
        """Onboarding (F5): store who the user is and seed the brain from it."""
        me = state.store.ensure_self()
        state.store.update_node(me.id, props={
            "display_name": body.name.strip(),
            "about": body.about.strip(),
            "onboarded": True,
        })
        seeded = {"nodes_created": [], "edges_created": []}
        if body.about.strip():
            seeded = ingest(body.about, state.store, state.llm)
        return {
            "name": body.name.strip(),
            "about": body.about.strip(),
            "onboarded": True,
            "seeded_nodes": len(seeded["nodes_created"]),
            "seeded_edges": len(seeded["edges_created"]),
        }

    @app.post("/api/chat")
    async def chat(body: ChatIn) -> dict[str, Any]:
        user_turn = state.history.append("user", body.message, session_id=body.session_id)
        events = await state.orchestrator.collect(body.message, turn_id=user_turn["id"])
        result = next((e for e in reversed(events) if e.kind in ("result", "error")), None)
        if result:
            state.history.append(
                "assistant", result.text, session_id=body.session_id, view=result.data.get("view")
            )
        return {"events": [e.to_dict() for e in events], "turn_id": user_turn["id"]}

    @app.get("/api/sessions")
    def sessions() -> dict[str, Any]:
        return {"sessions": state.history.sessions()}

    @app.post("/api/sessions")
    def new_session() -> dict[str, Any]:
        return state.history.create()

    @app.get("/api/graph")
    def graph() -> dict[str, Any]:
        return state.store.to_dict()

    @app.patch("/api/graph/nodes/{node_id}")
    def edit_node(node_id: str, patch: NodePatch) -> dict[str, Any]:
        node = state.store.update_node(node_id, **patch.model_dump(exclude_none=True))
        if node is None:
            raise HTTPException(404, "node not found")
        return node.to_dict()

    @app.delete("/api/graph/nodes/{node_id}")
    def delete_node(node_id: str) -> dict[str, Any]:
        if not state.store.delete_node(node_id):
            raise HTTPException(404, "node not found")
        return {"deleted": node_id}

    @app.get("/api/history")
    def history(session_id: str | None = None) -> dict[str, Any]:
        return {"history": state.history.turns(session_id)}

    @app.websocket("/ws")
    async def ws(sock: WebSocket) -> None:
        await sock.accept()
        try:
            while True:
                msg = await sock.receive_json()
                text = (msg or {}).get("message", "")
                session_id = (msg or {}).get("session_id")
                if not text:
                    continue
                user_turn = state.history.append("user", text, session_id=session_id)
                final = ""
                final_view: dict | None = None
                async for ev in state.orchestrator.handle_turn(text, turn_id=user_turn["id"]):
                    ev.data["turn_id"] = user_turn["id"]
                    await sock.send_json(ev.to_dict())
                    if ev.kind in ("result", "error"):
                        final = ev.text
                        final_view = ev.data.get("view")
                if final:
                    state.history.append("assistant", final, session_id=session_id, view=final_view)
        except WebSocketDisconnect:
            log.info("ws client disconnected")

    return app


# Module-level app for `uvicorn app.main:app`.
app = create_app()
