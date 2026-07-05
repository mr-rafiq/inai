"""Model catalog for the settings/onboarding UI.

Local providers (Ollama, LM Studio) are queried live so the picker shows what
is actually installed; cloud providers get curated presets. Everything fails
soft — a dead endpoint just returns the presets with source="presets".
"""
from __future__ import annotations

import json
import urllib.request
from typing import Any

PRESETS: dict[str, list[str]] = {
    "ollama": ["llama3.2", "llama3.1", "qwen2.5", "mistral", "phi3", "gemma2"],
    "lmstudio": [],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
    "anthropic": [
        "claude-fable-5",
        "claude-opus-4-8",
        "claude-sonnet-5",
        "claude-haiku-4-5-20251001",
    ],
    "mock": ["mock"],
}


def _get_json(url: str, timeout: float = 1.5) -> Any:
    with urllib.request.urlopen(url, timeout=timeout) as resp:  # noqa: S310 (localhost)
        return json.loads(resp.read().decode())


def list_models(provider: str, api_base: str = "") -> dict[str, Any]:
    """Return {"models": [...], "source": "live"|"presets"} for a provider."""
    try:
        if provider == "ollama":
            base = api_base or "http://localhost:11434"
            data = _get_json(f"{base}/api/tags")
            models = sorted({m["name"].split(":latest")[0] for m in data.get("models", [])})
            if models:
                return {"models": models, "source": "live"}
        elif provider == "lmstudio":
            base = api_base or "http://localhost:1234/v1"
            data = _get_json(f"{base}/models")
            models = [m["id"] for m in data.get("data", [])]
            if models:
                return {"models": models, "source": "live"}
    except Exception:
        pass  # fall through to presets
    return {"models": PRESETS.get(provider, []), "source": "presets"}
