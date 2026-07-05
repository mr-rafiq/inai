import pytest

from app.agent.orchestrator import Orchestrator
from app.brain.schema import Node
from app.llm.client import MockLLMClient
from app.tools.files import list_dir_structured, file_view_spec


@pytest.fixture
def file_root(tmp_path, monkeypatch):
    monkeypatch.setenv("INAI_FILE_ROOTS", str(tmp_path))
    (tmp_path / "b.txt").write_text("hello")
    (tmp_path / "a_dir").mkdir()
    return tmp_path


def test_list_dir_structured_orders_dirs_first(file_root):
    view = list_dir_structured(file_root)
    assert view["type"] == "file_list"
    assert [e["kind"] for e in view["entries"]] == ["dir", "file"]
    assert view["entries"][1] == {"name": "b.txt", "kind": "file", "size": 5, "suffix": ".txt"}


def test_file_view_spec_reads_text_file(file_root):
    view = file_view_spec(f"read {file_root}/b.txt")
    assert view["type"] == "file_content"
    assert view["content"] == "hello"


async def test_file_query_turn_carries_view(file_root, store):
    orch = Orchestrator(store, MockLLMClient())
    events = await orch.collect("what files are in my folder?")
    result = next(e for e in events if e.kind == "result")
    assert result.data["view"]["type"] == "file_list"
    assert any(e["name"] == "b.txt" for e in result.data["view"]["entries"])


async def test_show_my_tasks_returns_task_view(store, llm):
    store.upsert_node(Node(name="Buy groceries", type="Task"))
    store.upsert_node(Node(name="File taxes", type="Task", props={"done": True}))
    orch = Orchestrator(store, llm)
    events = await orch.collect("show me my tasks")
    result = next(e for e in events if e.kind == "result")
    view = result.data["view"]
    assert view["type"] == "task_list"
    assert {t["name"] for t in view["tasks"]} == {"Buy groceries", "File taxes"}
    assert "1 still open" in result.text
