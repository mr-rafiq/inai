# Inai (இணை)

> **Inai** — Tamil for *"to connect / link"* — a local-first, voice-driven personal AI
> assistant with a knowledge-graph brain and generative UI. Private by default,
> model-agnostic (Ollama · LM Studio · OpenAI · Anthropic).

Inai works the way a brain works: you **talk** to it, it **remembers** things as a
connected network of typed nodes and relationships (not a flat list of notes), and it
**shows** you things by generating live visual UI on the fly instead of only replying in
text. It runs on your own machine and never requires a cloud account to boot.

The name says it all: everything Inai stores is *connected*.

---

## ✨ Core principles

- **Local-first & sovereign** — runs fully offline with local models; cloud is opt-in.
- **Voice-native** — voice is the primary interface, but the app is fully usable by text.
- **Graph memory** — knowledge stored as typed nodes/edges, traversed on demand.
- **Generative UI** — bespoke visual views (tasks, finances, timelines) instead of walls of text.
- **Model-agnostic** — one config switch changes the underlying LLM.
- **Calm, alive UX** — a signature floating "orb" that shows the assistant's state.

## 🧱 Tech stack (target)

| Layer | Choice |
|---|---|
| Desktop shell | Tauri |
| Frontend | React + Vite + TypeScript + Tailwind + framer-motion |
| Backend | Python + FastAPI (WebSocket) |
| LLM routing | LiteLLM (OpenAI / Anthropic / Ollama / LM Studio) |
| Graph DB | Kùzu (embedded) |
| Voice (Phase 2) | faster-whisper (STT) · Kokoro/Piper (TTS) |
| Testing | pytest · Vitest · Playwright |

See [PRD-brain-assistant.md](PRD-brain-assistant.md) for the full product spec and phase plan.

---

## 🚀 Quick start

The project ships three launch scripts at the repo root:

```bash
./build.sh    # install all dependencies and build the app
./run.sh      # start the backend + frontend dev servers
./test.sh     # run the full test suite (backend + frontend)
```

Run `./build.sh` first, then `./run.sh`. Each script accepts `--help`.

### Requirements

- **Python** 3.11+ and **Node** 18+ (the scripts check for these)
- **Ollama** (optional, for local models) — https://ollama.com
- A cloud API key (optional) if you want to use OpenAI/Anthropic

---

## 🗺️ Status

Built phase by phase per the PRD:

- **Phase 1 — Foundation (text-only brain):** ✅ complete — see [PHASE_1_REPORT.md](PHASE_1_REPORT.md)
- **Phase 2 — Voice:** planned
- **Phase 3 — Generative UI:** planned

## 📄 License

MIT — see [LICENSE](LICENSE).
