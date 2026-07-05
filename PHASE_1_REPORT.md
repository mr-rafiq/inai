# Phase 1 Report — Foundation (text-only brain)

**Project:** Inai (இணை) · **Phase:** 1 of 3 · **Status:** ✅ Complete, all tests green

Inai is now a working, locally-runnable app you can **type** to. It **remembers**
statements as a typed knowledge graph, **answers** questions by traversing that
graph, **routes** to any LLM (local or cloud) through one config switch, and
already shows the signature **floating orb** reacting to the assistant's state.

---

## What was built

| Feature | Where | Notes |
|---|---|---|
| F2 Local backend + health check | `backend/app/main.py` | FastAPI, `GET /health` |
| F3 Config system | `backend/app/config.py` | env `INAI_*` ← `inai.toml` ← defaults; secrets only via env |
| F4 LLM router | `backend/app/llm/client.py` | LiteLLM (openai/anthropic/ollama/lmstudio) + offline `MockLLMClient`; graceful degrade |
| F6 Offline mode | config `provider=ollama`/`mock` | boots with no internet |
| F7 Embedded graph | `backend/app/brain/store.py` | Kùzu when available, JSON store fallback (default in tests) |
| F8 Typed schema | `backend/app/brain/schema.py` | Person, Task, Topic, Skill, Media, … + typed edges |
| F9 Ingestion | `backend/app/brain/ingest.py` | LLM extracts JSON → deterministic validate + write; every write logged |
| F10 Retrieval | `backend/app/brain/retrieve.py` | keyword start-nodes → BFS subgraph → grounded answer |
| F12 Entity resolution | `store.upsert_node` / `ingest._resolve` | dedups by (type + normalised name) |
| F14 Manual edit/delete | `PATCH`/`DELETE /api/graph/nodes/{id}` + Memory panel ✕ | |
| F15/F16 Chat + streaming | `/api/chat`, `WS /ws` | WebSocket streams events live |
| F17 Intent routing | `backend/app/agent/orchestrator.py` | memory_write / question / ui_request / action / chit_chat |
| F18 Two-tier response | `orchestrator.handle_turn` | instant `ack` event, then deep `result` |
| F19 History | `/api/history` | in-memory per session |
| F33 Orb | `frontend/src/components/Orb/Orb.tsx` | idle/listening/thinking/speaking, framer-motion |
| F34/F35 Design + theme | `frontend/src/App.tsx`, Tailwind | calm dark palette, light/dark toggle |
| F37 Accessibility | Orb `role=img`+aria, `prefers-reduced-motion` fallback, keyboard-usable form | |

**Deferred (with reason):**
- **Tauri desktop shell (F1 full):** no Rust toolchain on this machine; per the PRD
  rule about heavyweight installs it's deferred. Phase 1 runs as a web app
  (FastAPI + Vite), which satisfies the brain-focused DoD. Adding Tauri later is a
  thin wrapper — no architecture change.
- **F13 semantic/vector recall:** PRD marks it Phase 1-stretch/Phase 3. A
  deterministic `embed()` exists on the client for later use.

**Added after initial Phase 1 sign-off (UI overhaul):**
- **F5 onboarding wizard** — first-run flow: who you are (seeds the graph from
  your own words) → provider/model picker with live Ollama model list +
  connection test (`frontend/src/components/Onboarding/`).
- **Settings panel** — runtime provider/model/api-base/temperature switching,
  persisted to `inai.toml` via `PUT /api/config`; `POST /api/config/test` verifies
  the provider; `GET /api/models` lists installed local models.
- **Cinematic Three.js orb** — react-three-fiber shader orb (simplex-noise
  surface, fresnel glow, particle field), interactive (cursor parallax, hover,
  click pulse), with automatic CSS fallback for no-WebGL / reduced-motion.
- **Grounded mock answers** — the offline demo model now answers questions from
  the retrieved memory facts instead of echoing.
- **Startup resilience** — memory panel and profile fetches retry with backoff
  (fixes the "graph 500" seen when the frontend loaded before the backend).

---

## How to run

```bash
./build.sh        # installs backend (uv, Python 3.12 venv) + frontend deps, builds frontend
./run.sh          # starts FastAPI (:8000) + Vite (:5173) together; Ctrl-C stops both
```

Then open http://localhost:5173, type *"I'm learning Spanish, my friend Alex
teaches it"*, watch the memory panel gain nodes, then ask *"what am I learning?"*.

### Choosing a model (F4)
Copy `inai.example.toml` → `inai.toml` and set `provider`/`model`, or use env vars:

```bash
# Local (offline) — default
INAI_PROVIDER=ollama INAI_MODEL=llama3.2 ./run.sh

# Cloud
export OPENAI_API_KEY=sk-...
INAI_PROVIDER=openai INAI_MODEL=gpt-4o-mini ./run.sh

# Zero-dependency demo brain (no model needed)
INAI_PROVIDER=mock ./run.sh
```

If a cloud key is missing the app logs a clear message and falls back to the
offline client instead of hanging.

---

## How to test

```bash
./test.sh          # backend pytest (30) + frontend Vitest (6)
./test.sh --e2e    # also Playwright E2E (needs backend running: INAI_PROVIDER=mock ./run.sh --backend)
```

**Current results**
- Backend: **30 passed** (`backend/tests/`) — LLM router selection, model-string
  mapping, graph dedup, JSON-tolerant extraction, ingest round-trip + idempotency,
  retrieval subgraph, grounded answer, node edit/delete, health, config
  secret-hiding, chat round-trip, WebSocket ack-before-result.
- Frontend: **6 passed** (Vitest) — Orb state/aria for all four states, Chat
  render + send.
- E2E: **1 passed** (Playwright) — launch app → type statement → memory gains
  `Spanish` node → ask question → assistant answer contains `Spanish`; orb starts `idle`.

All LLM calls in tests use recorded/mock responses — no network or running model
required.

### Manual smoke (recommended before sign-off)
1. `INAI_PROVIDER=mock ./run.sh` → exercise the flow in the browser. ✅ verified here.
2. With a real local model: `ollama pull llama3.2 && ollama serve`, then
   `INAI_PROVIDER=ollama ./run.sh`.
3. With a cloud model: set the key and `INAI_PROVIDER=openai ./run.sh`.
4. Disconnect internet with `provider=ollama` to confirm offline operation.

---

## Definition of Done — checklist

- [x] App launches with one command (`./run.sh`).
- [x] Typed statement adds correct nodes/edges (verified: User→Spanish LEARNING, User→Alex KNOWS).
- [x] Question answered from the graph (grounded on retrieved subgraph).
- [x] Switchable local (Ollama) ↔ cloud (OpenAI/Anthropic) via one config switch.
- [x] Orb animates idle / thinking / speaking.
- [x] Works offline (local/mock provider, no internet).
- [x] Phase 1 tests pass (§8.1): unit, integration round-trip, E2E, secret-hiding.

## Architecture notes / deviations
- **Graph backend:** implemented behind a `GraphStore` interface with a
  pure-Python `JsonGraphStore` (default, zero-dep, fully tested) and a Kùzu-backed
  store used when `graph_backend=kuzu` and the package is installed. The factory
  falls back JSON with a clear log line so the app always boots — honouring
  "runnable locally at every step". This is the one substitution vs. the PRD's
  Kùzu-first default, chosen for reliability; flagged per the agent rules.
- **litellm/kuzu are optional installs** (`pip install -e ".[llm,graph]"`) so the
  test path needs no heavy download; imports are lazy.

## Next: Phase 2 (Voice)
STT (faster-whisper) → transcript → the existing orchestrator two-tier path → TTS
(Piper/Kokoro), barge-in, and the orb reacting to live audio amplitude. The
backend already emits the ack/result event stream voice will hang off of.
