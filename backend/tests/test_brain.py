from app.brain.schema import Node, Edge
from app.brain.store import JsonGraphStore
from app.brain.ingest import ingest, extract, _parse_json
from app.brain.retrieve import retrieve, answer_question, subgraph_to_text


def test_upsert_dedups_by_name_and_type(store):
    a, created_a = store.upsert_node(Node(name="Alex", type="Person"))
    b, created_b = store.upsert_node(Node(name="alex", type="Person"))  # case-insensitive
    assert created_a is True and created_b is False
    assert a.id == b.id
    assert len([n for n in store.nodes() if n.name.lower() == "alex"]) == 1


def test_parse_json_tolerates_prose_and_fences():
    raw = 'Sure! ```json\n{"entities":[{"name":"Spanish","type":"Skill"}],"relationships":[]}\n```'
    data = _parse_json(raw)
    assert data["entities"][0]["name"] == "Spanish"


def test_ingest_creates_expected_nodes_and_edges(store, llm):
    # MockLLMClient's naive extractor understands "learning X" and "friend Y".
    res = ingest("I'm learning Spanish, my friend Alex teaches it", store, llm)
    names = {n["name"].lower() for n in res["nodes_created"]}
    assert "spanish" in names
    assert "alex" in names
    # User -LEARNING-> Spanish edge exists
    text = subgraph_to_text({"nodes": store.to_dict()["nodes"], "edges": store.to_dict()["edges"]})
    assert "LEARNING" in text and "Spanish" in text


def test_ingest_is_idempotent(store, llm):
    ingest("I'm learning Spanish", store, llm)
    n1 = len(store.nodes())
    ingest("I'm learning Spanish", store, llm)
    n2 = len(store.nodes())
    assert n1 == n2  # dedup prevents duplicate nodes


def test_retrieve_returns_relevant_subgraph(store, llm):
    ingest("I'm learning Spanish", store, llm)
    sub = retrieve("what am I learning?", store)
    names = {n["name"].lower() for n in sub["nodes"]}
    assert "spanish" in names


def test_answer_question_is_grounded_in_graph(store):
    from app.llm.client import MockLLMClient
    # Script the answer model so we assert grounding deterministically.
    m = MockLLMClient(scripted={"learning": "You are learning Spanish."})
    ingest("I'm learning Spanish", store, m)
    res = answer_question("what am I learning?", store, m)
    assert "Spanish" in res["answer"]
    assert "Spanish" in res["facts"]


def test_manual_edit_and_delete(store):
    n, _ = store.upsert_node(Node(name="Groceries", type="Task"))
    store.update_node(n.id, props={"done": True})
    assert store.find_node(id=n.id).props["done"] is True
    assert store.delete_node(n.id) is True
    assert store.find_node(id=n.id) is None
