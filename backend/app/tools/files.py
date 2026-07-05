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


def allowed_roots(file_access: str | None = None) -> list[Path]:
    """Scope of file access, controlled by the user's permission setting.

    Modes: "off" (no access), "home" (default), "full" (entire drive).
    INAI_FILE_ROOTS env (colon-separated) overrides everything — used by tests.
    """
    import os

    env = os.environ.get("INAI_FILE_ROOTS")
    if env:
        return [Path(p).expanduser().resolve() for p in env.split(":") if p.strip()]
    mode = file_access or "home"
    if mode == "off":
        return []
    if mode == "full":
        return [Path("/")]
    return [Path.home().resolve()]


# Directories that make walk-search slow/noisy — never descended into.
_SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", ".Trash",
    "Library", "Applications", ".npm", ".cache", ".cargo", "dist", "build",
}
_SEARCH_MAX_DIRS = 20_000
_SEARCH_MAX_HITS = 5


def find_file(name: str, file_access: str | None = None) -> list[Path]:
    """Locate files by (fuzzy) name under the allowed roots — bounded walk."""
    import os

    roots = allowed_roots(file_access)
    needle = name.lower()
    hits: list[Path] = []
    visited = 0
    for root in roots:
        base = Path.home().resolve() if str(root) == "/" else root  # search home first even on "full"
        for dirpath, dirnames, filenames in os.walk(base):
            visited += 1
            if visited > _SEARCH_MAX_DIRS or len(hits) >= _SEARCH_MAX_HITS:
                break
            dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS and not d.startswith(".")]
            for fn in filenames:
                if needle in fn.lower():
                    hits.append(Path(dirpath) / fn)
                    if len(hits) >= _SEARCH_MAX_HITS:
                        break
    return hits


def is_file_query(text: str) -> bool:
    return bool(_FILE_QUERY_RE.search(text)) or bool(_FILENAME_RE.search(text))


# a bare filename like "Mohamed_Rafiq_CV.pdf" mentioned anywhere in the text
_FILENAME_RE = re.compile(r"\b([\w\- ]{2,64}\.(pdf|docx?|txt|md|csv|json|xlsx?|pptx?|png|jpe?g))\b", re.I)


def _inside_roots(path: Path, file_access: str | None = None) -> bool:
    roots = allowed_roots(file_access)
    if not roots:
        return False
    resolved = path.resolve()
    return any(resolved == r or r in resolved.parents for r in roots)


def resolve_path(text: str, file_access: str | None = None) -> Path:
    """Pull a target path out of free text; default to the first allowed root."""
    base = allowed_roots(file_access)[0]
    # explicit paths: ~/x, /Users/..., /home/...
    m = re.search(r"(~?/[\w./ \-]+)", text)
    if m:
        candidate = Path(m.group(1).strip().rstrip(".,!?")).expanduser()
        if _inside_roots(candidate, file_access):
            return candidate.resolve()
    # well-known folder names
    lower = text.lower()
    for key, folder in _WELL_KNOWN.items():
        if key in lower:
            candidate = base / folder
            if candidate.exists():
                return candidate.resolve()
    return base


_ACCESS_OFF_MSG = (
    "File access is turned off. You can grant it in Settings → File access "
    "(and revoke it again anytime)."
)


def safe_list(path: Path, file_access: str | None = None) -> str:
    if not allowed_roots(file_access):
        return _ACCESS_OFF_MSG
    if not _inside_roots(path, file_access):
        return f"Access to {path} is outside the allowed scope (see Settings → File access)."
    if not path.exists():
        return f"{path} does not exist."
    if path.is_file():
        return safe_read(path, file_access)
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


def extract_pdf_text(path: Path, max_pages: int = 25) -> str:
    """Extract text from a PDF (bounded pages/characters)."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = reader.pages[:max_pages]
    chunks = []
    total = 0
    for i, page in enumerate(pages):
        t = (page.extract_text() or "").strip()
        if t:
            chunks.append(t)
            total += len(t)
        if total > MAX_READ_BYTES:
            chunks.append(f"… (stopped at page {i + 1})")
            break
    note = f" (showing {len(pages)} of {len(reader.pages)} pages)" if len(reader.pages) > max_pages else ""
    return f"Text of {path.name}{note}:\n" + "\n\n".join(chunks) if chunks else f"{path.name}: no extractable text (likely a scanned/image PDF)."


def safe_read(path: Path, file_access: str | None = None) -> str:
    if not allowed_roots(file_access):
        return _ACCESS_OFF_MSG
    if not _inside_roots(path, file_access):
        return f"Access to {path} is outside the allowed scope (see Settings → File access)."
    if not path.exists():
        return f"{path} does not exist."
    if path.is_dir():
        return safe_list(path, file_access)
    size = path.stat().st_size
    if path.suffix.lower() == ".pdf":
        try:
            return extract_pdf_text(path)
        except Exception as exc:
            return f"Couldn't extract text from {path.name}: {exc}"
    if path.suffix.lower() not in _TEXT_SUFFIXES:
        return f"{path.name} is a {path.suffix or 'binary'} file ({size:,} bytes) — I can see it but won't dump binary content."
    data = path.read_bytes()[:MAX_READ_BYTES]
    text = data.decode("utf-8", errors="replace")
    suffix = f"\n… (truncated at {MAX_READ_BYTES // 1024}KB of {size:,} bytes)" if size > MAX_READ_BYTES else ""
    return f"Contents of {path}:\n{text}{suffix}"


def handle_file_query(text: str, file_access: str | None = None) -> str:
    """Deterministic file lookup used as grounding for the LLM's answer."""
    if not allowed_roots(file_access):
        return _ACCESS_OFF_MSG
    # A named file ("Mohamed_Rafiq_CV.pdf") beats path guessing: search for it.
    m = _FILENAME_RE.search(text)
    if m:
        hits = find_file(m.group(1), file_access)
        if len(hits) == 1:
            return safe_read(hits[0], file_access)
        if hits:
            listing = "\n".join(f"  {p}" for p in hits)
            return f"Found several files matching “{m.group(1)}”:\n{listing}\nReading the first:\n\n" + safe_read(hits[0], file_access)
        return f"I couldn't find a file named “{m.group(1)}” under the allowed scope."
    target = resolve_path(text, file_access)
    wants_read = bool(re.search(r"\b(read|open|show|contents?|what'?s inside)\b", text, re.I))
    if target.is_file() or wants_read and target.exists() and target.is_file():
        return safe_read(target, file_access)
    return safe_list(target, file_access)


# ---- structured view specs (generative UI, F27/F29) --------------------------

def list_dir_structured(path: Path, file_access: str | None = None) -> dict | None:
    """Directory listing as data, for the frontend's rich file view."""
    if not _inside_roots(path, file_access) or not path.exists() or not path.is_dir():
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


def read_file_structured(path: Path, file_access: str | None = None) -> dict | None:
    """File contents as data, for the frontend's code/text view."""
    if not _inside_roots(path, file_access) or not path.is_file():
        return None
    size = path.stat().st_size
    if path.suffix.lower() == ".pdf":
        try:
            return {"type": "file_content", "path": str(path), "content": extract_pdf_text(path), "truncated": False}
        except Exception:
            return None
    if path.suffix.lower() not in _TEXT_SUFFIXES:
        return None  # binary — the text answer explains it
    data = path.read_bytes()[:MAX_READ_BYTES]
    return {
        "type": "file_content",
        "path": str(path),
        "content": data.decode("utf-8", errors="replace"),
        "truncated": size > MAX_READ_BYTES,
    }


def file_view_spec(text: str, file_access: str | None = None) -> dict | None:
    """Best structured view for a file query, or None (text answer only)."""
    if not allowed_roots(file_access):
        return None
    m = _FILENAME_RE.search(text)
    if m:
        hits = find_file(m.group(1), file_access)
        if hits:
            return read_file_structured(hits[0], file_access)
        return None
    target = resolve_path(text, file_access)
    if target.is_dir():
        return list_dir_structured(target, file_access)
    if target.is_file():
        return read_file_structured(target, file_access)
    return None
