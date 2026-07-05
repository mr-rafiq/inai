import pytest

from app.agent.orchestrator import classify_intent, Intent, Orchestrator
from app.brain.store import JsonGraphStore
from app.llm.client import MockLLMClient


@pytest.mark.parametrize("text,expected", [
    ("I'm learning Spanish", Intent.MEMORY_WRITE),
    ("Remember that I watched Oppenheimer", Intent.MEMORY_WRITE),
    ("what am I learning?", Intent.QUESTION),
    ("who is Alex?", Intent.QUESTION),
    ("show me my tasks", Intent.UI_REQUEST),
    ("hey", Intent.CHIT_CHAT),
])
def test_classify_intent(text, expected):
    assert classify_intent(text) == expected


async def test_two_tier_ack_precedes_result(store, llm):
    orch = Orchestrator(store, llm)
    events = await orch.collect("what am I learning?")
    kinds = [e.kind for e in events]
    assert kinds[0] == "ack"                    # instant acknowledgment first
    assert "result" in kinds                    # deep answer follows
    assert kinds.index("ack") < kinds.index("result")


async def test_memory_write_turn_updates_graph(store, llm):
    orch = Orchestrator(store, llm)
    events = await orch.collect("I'm learning Spanish")
    result = next(e for e in events if e.kind == "result")
    assert result.data["intent"] == "memory_write"
    assert any(n["name"].lower() == "spanish" for n in result.data["nodes_created"])


async def test_question_turn_returns_subgraph(store):
    m = MockLLMClient(scripted={"learning": "You're learning Spanish."})
    orch = Orchestrator(store, m)
    await orch.collect("I'm learning Spanish")
    events = await orch.collect("what am I learning?")
    result = next(e for e in events if e.kind == "result")
    assert "subgraph" in result.data
    assert result.data["subgraph"]["nodes"]
