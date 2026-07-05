"""FastAPI app (F2, F15, F16, F19) — Inai backend.

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

import logging
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


class AppState:
    """Holds long-lived singletons; rebuildable for tests."""

    def __init__(self, cfg: Config, store: GraphStore, llm: LLMClient):
        self.cfg = cfg
        self.store = store
        self.llm = llm
        self.orchestrator = Orchestrator(store, llm)
        self.history: list[dict[str, Any]] = []  # F19 (in-memory; persisted with graph dir)


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
            state.orchestrator = Orchestrator(state.store, state.llm)
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
        events = await state.orchestrator.collect(body.message)
        result = next((e for e in reversed(events) if e.kind in ("result", "error")), None)
        state.history.append({"role": "user", "content": body.message})
        if result:
            state.history.append({"role": "assistant", "content": result.text})
        return {"events": [e.to_dict() for e in events]}

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
    def history() -> dict[str, Any]:
        return {"history": state.history}

    @app.websocket("/ws")
    async def ws(sock: WebSocket) -> None:
        await sock.accept()
        try:
            while True:
                msg = await sock.receive_json()
                text = (msg or {}).get("message", "")
                if not text:
                    continue
                state.history.append({"role": "user", "content": text})
                final = ""
                async for ev in state.orchestrator.handle_turn(text):
                    await sock.send_json(ev.to_dict())
                    if ev.kind in ("result", "error"):
                        final = ev.text
                if final:
                    state.history.append({"role": "assistant", "content": final})
        except WebSocketDisconnect:
            log.info("ws client disconnected")

    return app


# Module-level app for `uvicorn app.main:app`.
app = create_app()
