"""File system access for the assistant — deliberately READ-ONLY.

Inai can list folders, read files, and search names under the user's home
directory, so questions like "what's in my Downloads?" work. Writes/deletes
are intentionally not implemented yet: an LLM with unconfirmed write access
to a filesystem is a data-loss machine. When write support lands it will go
through an explicit user-confirmation flow.

Safety rules:
  * every resolved path must stay inside one of the allowed roots
  * symlinks are resolved before the check (no escape via links)
  * file reads are size-capped; binary files are described, not dumped
"""
from __future__ import annotations

import re
from pathlib import Path

MAX_READ_BYTES = 64 * 1024
MAX_LIST_ENTRIES = 200

_TEXT_SUFFIXES = {
    ".txt", ".md", ".py", ".js", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml",
    ".csv", ".html", ".css", ".sh", ".log", ".xml", ".ini", ".cfg", ".rs", ".go",
}

_FILE_QUERY_RE = re.compile(
    r"\b(files?|folders?|director(y|ies)|downloads|desktop|documents|home dir|"
    r"\.(pdf|txt|md|csv|png|jpe?g|py|json|zip))\b",
    re.I,
)

_WELL_KNOWN = {
    "downloads": "Downloads",
    "desktop": "Desktop",
    "documents": "Documents",
    "pictures": "Pictures",
    "music": "Music",
    "movies": "Movies",
}


def allowed_roots() -> list[Path]:
    """Home directory by default; overridable via INAI_FILE_ROOTS (colon-separated)."""
    import os

    env = os.environ.get("INAI_FILE_ROOTS")
    if env:
        return [Path(p).expanduser().resolve() for p in env.split(":") if p.strip()]
    return [Path.home().resolve()]


def is_file_query(text: str) -> bool:
    return bool(_FILE_QUERY_RE.search(text))


def _inside_roots(path: Path) -> bool:
    resolved = path.resolve()
    return any(resolved == r or r in resolved.parents for r in allowed_roots())


def resolve_path(text: str) -> Path:
    """Pull a target path out of free text; default to the first allowed root."""
    base = allowed_roots()[0]
    # explicit paths: ~/x, /Users/..., /home/...
    m = re.search(r"(~?/[\w./ \-]+)", text)
    if m:
        candidate = Path(m.group(1).strip().rstrip(".,!?")).expanduser()
        if _inside_roots(candidate):
            return candidate.resolve()
    # well-known folder names
    lower = text.lower()
    for key, folder in _WELL_KNOWN.items():
        if key in lower:
            candidate = base / folder
            if candidate.exists():
                return candidate.resolve()
    return base


def safe_list(path: Path) -> str:
    if not _inside_roots(path):
        return f"Access outside your home directory is not allowed: {path}"
    if not path.exists():
        return f"{path} does not exist."
    if path.is_file():
        return safe_read(path)
    entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    lines = [f"Contents of {path} ({len(entries)} entries):"]
    for p in entries[:MAX_LIST_ENTRIES]:
        if p.name.startswith("."):
            continue
        kind = "dir " if p.is_dir() else "file"
        size = "" if p.is_dir() else f"  {p.stat().st_size:,} bytes"
        lines.append(f"  [{kind}] {p.name}{size}")
    if len(entries) > MAX_LIST_ENTRIES:
        lines.append(f"  … and {len(entries) - MAX_LIST_ENTRIES} more")
    return "\n".join(lines)


def safe_read(path: Path) -> str:
    if not _inside_roots(path):
        return f"Access outside your home directory is not allowed: {path}"
    if not path.exists():
        return f"{path} does not exist."
    if path.is_dir():
        return safe_list(path)
    size = path.stat().st_size
    if path.suffix.lower() not in _TEXT_SUFFIXES:
        return f"{path.name} is a {path.suffix or 'binary'} file ({size:,} bytes) — I can see it but won't dump binary content."
    data = path.read_bytes()[:MAX_READ_BYTES]
    text = data.decode("utf-8", errors="replace")
    suffix = f"\n… (truncated at {MAX_READ_BYTES // 1024}KB of {size:,} bytes)" if size > MAX_READ_BYTES else ""
    return f"Contents of {path}:\n{text}{suffix}"


def handle_file_query(text: str) -> str:
    """Deterministic file lookup used as grounding for the LLM's answer."""
    target = resolve_path(text)
    wants_read = bool(re.search(r"\b(read|open|show|contents?|what'?s inside)\b", text, re.I))
    if target.is_file() or wants_read and target.exists() and target.is_file():
        return safe_read(target)
    return safe_list(target)


# ---- structured view specs (generative UI, F27/F29) --------------------------

def list_dir_structured(path: Path) -> dict | None:
    """Directory listing as data, for the frontend's rich file view."""
    if not _inside_roots(path) or not path.exists() or not path.is_dir():
        return None
    entries = []
    for p in sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if p.name.startswith("."):
            continue
        entries.append({
            "name": p.name,
            "kind": "dir" if p.is_dir() else "file",
            "size": None if p.is_dir() else p.stat().st_size,
            "suffix": p.suffix.lower(),
        })
    return {
        "type": "file_list",
        "path": str(path),
        "entries": entries[:MAX_LIST_ENTRIES],
        "total": len(entries),
    }


def read_file_structured(path: Path) -> dict | None:
    """File contents as data, for the frontend's code/text view."""
    if not _inside_roots(path) or not path.is_file():
        return None
    size = path.stat().st_size
    if path.suffix.lower() not in _TEXT_SUFFIXES:
        return None  # binary — the text answer explains it
    data = path.read_bytes()[:MAX_READ_BYTES]
    return {
        "type": "file_content",
        "path": str(path),
        "content": data.decode("utf-8", errors="replace"),
        "truncated": size > MAX_READ_BYTES,
    }


def file_view_spec(text: str) -> dict | None:
    """Best structured view for a file query, or None (text answer only)."""
    target = resolve_path(text)
    if target.is_dir():
        return list_dir_structured(target)
    if target.is_file():
        return read_file_structured(target)
    return None
