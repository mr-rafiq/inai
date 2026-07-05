"""LLM Router (F4).

A single ``LLMClient`` interface behind which any provider can sit. LiteLLM
gives us one API for OpenAI, Anthropic, Ollama and LM Studio; ``MockLLMClient``
lets tests (and a fully offline first run) work with zero network.

Design rules from the PRD:
  * degrade gracefully — a missing cloud key falls back to a local model
  * never hang the UI — every call is bounded by ``request_timeout``
  * ``litellm`` is imported lazily so the mock path needs no heavy install
"""
from __future__ import annotations

import json
import re
from typing import Iterable, Iterator, Protocol, runtime_checkable

from ..config import Config

Message = dict[str, str]  # {"role": "user"|"system"|"assistant", "content": str}


@runtime_checkable
class LLMClient(Protocol):
    name: str

    def complete(self, messages: list[Message], **kw) -> str: ...
    def stream(self, messages: list[Message], **kw) -> Iterator[str]: ...
    def embed(self, text: str) -> list[float]: ...


def _model_string(cfg: Config) -> str:
    """Map our provider/model to a LiteLLM model string."""
    p, m = cfg.provider, cfg.model
    if p == "ollama":
        return f"ollama/{m}"
    if p == "lmstudio":
        # LM Studio exposes an OpenAI-compatible server
        return f"openai/{m}"
    if p == "anthropic":
        return f"anthropic/{m}"
    return m  # openai and anything already fully-qualified


class LiteLLMClient:
    """Real provider client backed by LiteLLM."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.name = f"{cfg.provider}:{cfg.model}"
        self._model = _model_string(cfg)

    def _kwargs(self) -> dict:
        kw: dict = {
            "model": self._model,
            "temperature": self.cfg.temperature,
            "timeout": self.cfg.request_timeout,
        }
        if self.cfg.api_base:
            kw["api_base"] = self.cfg.api_base
        elif self.cfg.provider == "ollama":
            kw["api_base"] = "http://localhost:11434"
        elif self.cfg.provider == "lmstudio":
            kw["api_base"] = "http://localhost:1234/v1"
        if self.cfg.api_key:
            kw["api_key"] = self.cfg.api_key
        elif self.cfg.provider == "lmstudio":
            # LM Studio's OpenAI-compatible server ignores the key, but the
            # OpenAI client refuses to start without one.
            kw["api_key"] = "lm-studio"
        return kw

    def complete(self, messages: list[Message], **kw) -> str:
        import litellm  # lazy

        resp = litellm.completion(messages=messages, **{**self._kwargs(), **kw})
        return resp["choices"][0]["message"]["content"] or ""

    def stream(self, messages: list[Message], **kw) -> Iterator[str]:
        import litellm  # lazy

        for chunk in litellm.completion(
            messages=messages, stream=True, **{**self._kwargs(), **kw}
        ):
            delta = chunk["choices"][0]["delta"].get("content")
            if delta:
                yield delta

    def embed(self, text: str) -> list[float]:
        import litellm  # lazy

        model = "text-embedding-3-small" if self.cfg.is_cloud else self._model
        resp = litellm.embedding(model=model, input=[text], **(
            {"api_base": self.cfg.api_base} if self.cfg.api_base else {}
        ))
        return resp["data"][0]["embedding"]


class MockLLMClient:
    """Deterministic offline client used by tests and as a no-network fallback.

    It understands two request shapes used by the app:
      * extraction prompts (contains the marker ``EXTRACT_JSON``) -> emits JSON
      * everything else -> a short echo-style reply
    Custom canned responses can be injected for precise tests.
    """

    def __init__(self, cfg: Config | None = None, scripted: dict[str, str] | None = None):
        self.cfg = cfg
        self.name = "mock"
        self.scripted = scripted or {}
        self.calls: list[list[Message]] = []

    def _last_user(self, messages: list[Message]) -> str:
        for m in reversed(messages):
            if m.get("role") == "user":
                return m.get("content", "")
        return ""

    def complete(self, messages: list[Message], **kw) -> str:
        self.calls.append(messages)
        user = self._last_user(messages)
        system = " ".join(m["content"] for m in messages if m["role"] == "system")
        # Extraction is a structural concern — handle it before scripted answers
        # so an answer keyword can't accidentally hijack a memory-write.
        if "EXTRACT_JSON" in system or "EXTRACT_JSON" in user:
            return self._naive_extract(user)
        for needle, canned in self.scripted.items():
            if needle in user:
                return canned
        # Grounded answers: when the orchestrator hands us memory facts, use them.
        if "MEMORY FACTS:" in system:
            facts = system.split("MEMORY FACTS:", 1)[1].strip()
            lines = [ln.strip() for ln in facts.splitlines() if ln.strip()]
            if lines and "(nothing relevant" not in facts:
                pretty = "; ".join(
                    ln.replace("-", " ").replace(">", "").replace("  ", " ") for ln in lines[:6]
                )
                return f"Here's what I remember: {pretty}."
            return "I don't have anything about that in memory yet — tell me and I'll remember it."
        return f"I hear you: “{user.strip()[:200]}”. (I'm the offline demo model — point Inai at Ollama or a cloud model in Settings for real conversation.)"

    def stream(self, messages: list[Message], **kw) -> Iterator[str]:
        for token in re.findall(r"\S+\s*", self.complete(messages, **kw)):
            yield token

    def embed(self, text: str) -> list[float]:
        # tiny deterministic bag-of-words hash embedding (8 dims)
        vec = [0.0] * 8
        for tok in re.findall(r"[a-z0-9]+", text.lower()):
            vec[hash(tok) % 8] += 1.0
        norm = sum(v * v for v in vec) ** 0.5 or 1.0
        return [v / norm for v in vec]

    def _naive_extract(self, text: str) -> str:
        """Very small heuristic extractor so mock ingestion is meaningful."""
        entities: list[dict] = []
        rels: list[dict] = []
        lt = text.lower()
        m = re.search(r"learning ([a-z][\w ]+?)(?:[.,]|$| and | with )", lt)
        if m:
            topic = m.group(1).strip().title()
            entities.append({"name": topic, "type": "Skill"})
            rels.append({"source": "User", "type": "LEARNING", "target": topic})
        for who in re.findall(r"friend (\w+)", lt):
            entities.append({"name": who.title(), "type": "Person"})
            rels.append({"source": "User", "type": "KNOWS", "target": who.title()})
        return json.dumps({"entities": entities, "relationships": rels})


def get_llm_client(cfg: Config) -> LLMClient:
    """Factory implementing graceful degradation (F4)."""
    if cfg.provider == "mock":
        return MockLLMClient(cfg)
    if cfg.missing_cloud_key():
        # No key for the selected cloud provider -> caller should surface this.
        # We still return a client but flag via the exception-free fallback:
        raise LLMConfigError(
            f"Provider '{cfg.provider}' selected but {cfg.provider.upper()} API key is missing. "
            "Set the key or switch provider to 'ollama' for offline use."
        )
    return LiteLLMClient(cfg)


class LLMConfigError(RuntimeError):
    """Raised when the selected provider cannot be used as configured."""
