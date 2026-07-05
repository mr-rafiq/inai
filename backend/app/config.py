"""Configuration system (F3).

Single source of truth for choosing the LLM provider/model, keys, and storage
backends. Values come from (in order of precedence):

  1. Environment variables (INAI_*)
  2. A local ``inai.toml`` file at the repo root or backend/ dir
  3. Built-in defaults (fully offline-capable, no cloud account required)

Nothing here requires a network connection to import.
"""
from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# Provider -> which env var holds its API key (None = no key needed / local).
_PROVIDER_KEYS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "ollama": None,
    "lmstudio": None,
    "mock": None,
}

_DEFAULTS: dict[str, Any] = {
    # LLM
    "provider": "ollama",          # openai | anthropic | ollama | lmstudio | mock
    "model": "llama3.2",           # default local model to target
    "fast_model": "",              # optional smaller model for the quick ack; "" = reuse model
    "api_base": "",                # override endpoint (LM Studio / custom Ollama host)
    "temperature": 0.2,
    "request_timeout": 60,         # seconds; never hang the UI
    # Storage
    "graph_backend": "kuzu",       # kuzu | json  (json is the zero-dep fallback)
    "file_access": "home",         # off | home | full — user-revocable permission
    "data_dir": "",                # "" -> <repo>/data
    # Server
    "host": "127.0.0.1",
    "port": 8000,
}


def _repo_root() -> Path:
    # backend/app/config.py -> repo root is two parents up from app/
    return Path(__file__).resolve().parents[2]


def _config_path() -> Path:
    """Settings file location; INAI_CONFIG_PATH overrides for test isolation."""
    env = os.environ.get("INAI_CONFIG_PATH")
    return Path(env).expanduser() if env else _repo_root() / "inai.toml"


def _load_toml() -> dict[str, Any]:
    for candidate in (_config_path(), _repo_root() / "backend" / "inai.toml"):
        if candidate.is_file():
            with candidate.open("rb") as fh:
                data = tomllib.load(fh)
            # allow either flat keys or an [inai] table
            return data.get("inai", data)
    return {}


def _coerce(default: Any, value: Any) -> Any:
    if isinstance(default, bool):
        return str(value).strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(default, int) and not isinstance(default, bool):
        return int(value)
    if isinstance(default, float):
        return float(value)
    return value


@dataclass
class Config:
    provider: str = _DEFAULTS["provider"]
    model: str = _DEFAULTS["model"]
    fast_model: str = _DEFAULTS["fast_model"]
    api_base: str = _DEFAULTS["api_base"]
    temperature: float = _DEFAULTS["temperature"]
    request_timeout: int = _DEFAULTS["request_timeout"]
    graph_backend: str = _DEFAULTS["graph_backend"]
    file_access: str = _DEFAULTS["file_access"]
    data_dir: str = _DEFAULTS["data_dir"]
    host: str = _DEFAULTS["host"]
    port: int = _DEFAULTS["port"]

    # --- derived helpers ---------------------------------------------------
    @property
    def api_key(self) -> str | None:
        env = _PROVIDER_KEYS.get(self.provider)
        return os.environ.get(env) if env else None

    @property
    def is_cloud(self) -> bool:
        return self.provider in {"openai", "anthropic"}

    @property
    def resolved_data_dir(self) -> Path:
        d = Path(self.data_dir) if self.data_dir else _repo_root() / "data"
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def fast_model_name(self) -> str:
        return self.fast_model or self.model

    def missing_cloud_key(self) -> bool:
        """True if a cloud provider is selected but its key is absent."""
        return self.is_cloud and not self.api_key

    def to_public_dict(self) -> dict[str, Any]:
        """Config safe to send to the UI (never includes secrets)."""
        d = asdict(self)
        d["is_cloud"] = self.is_cloud
        d["has_api_key"] = bool(self.api_key)
        return d


# Fields the user may change at runtime from the UI (F3/F5). Server/storage
# fields stay file-managed to avoid footguns.
UPDATABLE_FIELDS = {
    "provider", "model", "fast_model", "api_base", "temperature", "request_timeout",
    "file_access",
}


def save_config(cfg: Config) -> Path:
    """Persist user-tunable settings to the config file (never secrets)."""
    path = _config_path()
    lines = ["# Inai settings — managed by the app (Settings panel). Safe to edit.", "[inai]"]
    for key in sorted(UPDATABLE_FIELDS) + ["graph_backend"]:
        val = getattr(cfg, key)
        if isinstance(val, str):
            lines.append(f'{key} = "{val}"')
        else:
            lines.append(f"{key} = {val}")
    path.write_text("\n".join(lines) + "\n")
    return path


def load_config(overrides: dict[str, Any] | None = None) -> Config:
    """Build a Config from defaults <- toml <- env <- explicit overrides."""
    values = dict(_DEFAULTS)
    values.update(_load_toml())
    for key, default in _DEFAULTS.items():
        env_val = os.environ.get(f"INAI_{key.upper()}")
        if env_val is not None:
            values[key] = _coerce(default, env_val)
    if overrides:
        values.update(overrides)
    # keep only known fields
    known = {k: values[k] for k in _DEFAULTS if k in values}
    return Config(**known)
