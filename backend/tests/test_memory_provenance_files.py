import pytest
from fastapi.testclient import TestClient

from app.agent.orchestrator import classify_intent, Intent, Orchestrator
from app.brain.ingest import ingest
from app.config import Config
from app.llm.client import MockLLMClient
from app.main import create_app
from app.tools.files import safe_list, safe_read, is_file_query, resolve_path


# ---- fact-loss fix ----------------------------------------------------------

def test_i_know_is_a_memory_write():
    assert classify_intent("I know a person, pavi.") == Intent.MEMORY_WRITE


async def test_chit_chat_still_extracts_facts(store, llm):
    """Facts mentioned in casual talk must never be lost."""
    orch = Orchestrator(store, llm)
    # classified chit_chat (no memory-verb), but mentions a friend
    text = "haha nice, that friend Pavi tells great jokes"
    assert classify_intent(text) == Intent.CHIT_CHAT
    events = await orch.collect(text)
    result = next(e for e in events if e.kind == "result")
    assert any(n["name"] == "Pavi" for n in result.data["nodes_created"])
    assert any(n.name == "Pavi" for n in store.nodes())


# ---- provenance -------------------------------------------------------------

def test_ingest_stamps_provenance(store, llm):
    res = ingest("I'm learning Spanish", store, llm, source_turn="turn-42")
    node = next(n for n in store.nodes() if n.name == "Spanish")
    assert node.props["source_turn"] == "turn-42"
    assert "learning Spanish" in node.props["source_text"]
    edge = store.edges()[0]
    assert edge.props["source_turn"] == "turn-42"


# ---- persistent history -----------------------------------------------------

def test_history_persists_across_restarts(tmp_path):
    cfg = Config(provider="mock", graph_backend="json", data_dir=str(tmp_path))
    app1 = create_app(cfg, llm=MockLLMClient())
    c1 = TestClient(app1)
    c1.post("/api/chat", json={"message": "I'm learning Spanish"})
    turns = c1.get("/api/history").json()["history"]
    assert len(turns) == 2 and all("id" in t for t in turns)

    # a brand-new app instance over the same data dir sees the same history
    app2 = create_app(cfg, llm=MockLLMClient())
    c2 = TestClient(app2)
    reloaded = c2.get("/api/history").json()["history"]
    assert reloaded == turns


# ---- file access (read-only, sandboxed) --------------------------------------

@pytest.fixture
def file_root(tmp_path, monkeypatch):
    monkeypatch.setenv("INAI_FILE_ROOTS", str(tmp_path))
    (tmp_path / "notes.txt").write_text("meeting at noon")
    (tmp_path / "sub").mkdir()
    return tmp_path


def test_is_file_query_detection():
    assert is_file_query("what's in my Downloads folder?")
    assert is_file_query("read ~/notes.txt")
    assert not is_file_query("what am I learning?")


def test_safe_list_and_read(file_root):
    listing = safe_list(file_root)
    assert "notes.txt" in listing and "sub" in listing
    content = safe_read(file_root / "notes.txt")
    assert "meeting at noon" in content


def test_path_traversal_is_blocked(file_root):
    assert "not allowed" in safe_read(file_root / ".." / "escape.txt")
    assert "not allowed" in safe_list((file_root / "sub" / ".." / "..").resolve())


def test_resolve_path_defaults_inside_roots(file_root):
    # free text with no recognizable path falls back to the first allowed root
    p = resolve_path("just show me some files please")
    assert str(p).startswith(str(file_root.resolve().anchor))


async def test_file_query_turn(file_root, store):
    llm = MockLLMClient(scripted={"files": "You have notes.txt and a sub folder."})
    orch = Orchestrator(store, llm)
    events = await orch.collect("what files are in my folder?")
    result = next(e for e in events if e.kind == "result")
    assert result.data["intent"] == "file_query"
    assert "notes.txt" in result.data["findings"]
