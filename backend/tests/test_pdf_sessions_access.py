import json

import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.llm.client import MockLLMClient
from app.main import create_app
from app.tools.files import (
    allowed_roots, find_file, handle_file_query, extract_pdf_text, safe_read,
)


@pytest.fixture
def file_root(tmp_path, monkeypatch):
    monkeypatch.setenv("INAI_FILE_ROOTS", str(tmp_path))
    return tmp_path


def _make_pdf(path, text="Mohamed Rafiq — Engineer. Skills: Python, ML."):
    from pypdf import PdfWriter

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    # pypdf can't draw text on a blank page; embed via annotation-free approach:
    # use a simple content stream instead.
    from pypdf.generic import DecodedStreamObject, NameObject, DictionaryObject, ArrayObject, NumberObject

    stream = DecodedStreamObject()
    stream.set_data(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode())
    page[NameObject("/Contents")] = writer._add_object(stream)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): DictionaryObject({
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            })
        })
    })
    with open(path, "wb") as fh:
        writer.write(fh)


# ---- PDF reading -------------------------------------------------------------

def test_pdf_text_extraction(file_root):
    pdf = file_root / "Mohamed_Rafiq_CV.pdf"
    _make_pdf(pdf)
    out = extract_pdf_text(pdf)
    assert "Mohamed Rafiq" in out and "Python" in out


def test_safe_read_handles_pdf(file_root):
    pdf = file_root / "cv.pdf"
    _make_pdf(pdf)
    assert "Mohamed Rafiq" in safe_read(pdf)


# ---- find-by-name --------------------------------------------------------------

def test_find_file_locates_nested_file(file_root):
    nested = file_root / "Documents" / "cvs"
    nested.mkdir(parents=True)
    _make_pdf(nested / "Mohamed_Rafiq_CV.pdf")
    hits = find_file("Mohamed_Rafiq_CV.pdf")
    assert hits and hits[0].name == "Mohamed_Rafiq_CV.pdf"


def test_bare_filename_query_reads_the_file(file_root):
    _make_pdf(file_root / "Mohamed_Rafiq_CV.pdf")
    out = handle_file_query("Mohamed_Rafiq_CV.pdf Go through this CV and tell me what you see")
    assert "Mohamed Rafiq" in out  # actual PDF text, not a directory listing


# ---- permission modes ----------------------------------------------------------

def test_file_access_modes(monkeypatch):
    monkeypatch.delenv("INAI_FILE_ROOTS", raising=False)
    assert allowed_roots("off") == []
    assert str(allowed_roots("full")[0]) == "/"
    assert allowed_roots("home")[0].name  # home dir


def test_file_access_off_blocks_queries(monkeypatch):
    monkeypatch.delenv("INAI_FILE_ROOTS", raising=False)
    out = handle_file_query("list my downloads", file_access="off")
    assert "Settings" in out and "File access" in out


# ---- chat sessions (shared brain) ----------------------------------------------

def test_sessions_share_one_graph(tmp_path):
    cfg = Config(provider="mock", graph_backend="json", data_dir=str(tmp_path))
    app = create_app(cfg, llm=MockLLMClient())
    c = TestClient(app)

    s1 = c.get("/api/sessions").json()["sessions"][0]
    c.post("/api/chat", json={"message": "I'm learning Spanish", "session_id": s1["id"]})

    s2 = c.post("/api/sessions").json()
    assert s2["id"] != s1["id"]
    c.post("/api/chat", json={"message": "I'm learning Guitar", "session_id": s2["id"]})

    # histories are separate…
    h1 = c.get("/api/history", params={"session_id": s1["id"]}).json()["history"]
    h2 = c.get("/api/history", params={"session_id": s2["id"]}).json()["history"]
    assert "Spanish" in h1[0]["content"] and "Guitar" in h2[0]["content"]

    # …but the brain is one graph containing both facts
    names = {n["name"] for n in c.get("/api/graph").json()["nodes"]}
    assert {"Spanish", "Guitar"} <= names

    # first message titles the session
    titles = {s["title"] for s in c.get("/api/sessions").json()["sessions"]}
    assert any("Spanish" in t for t in titles) and any("Guitar" in t for t in titles)


def test_legacy_history_migrates(tmp_path):
    legacy = [{"id": "a", "role": "user", "content": "old message"}]
    (tmp_path / "history.json").write_text(json.dumps(legacy))
    cfg = Config(provider="mock", graph_backend="json", data_dir=str(tmp_path))
    app = create_app(cfg, llm=MockLLMClient())
    c = TestClient(app)
    turns = c.get("/api/history").json()["history"]
    assert turns and turns[0]["content"] == "old message"
