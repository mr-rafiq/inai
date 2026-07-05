import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.main import create_app
from app.llm.client import MockLLMClient


@pytest.fixture
def client(tmp_path):
    cfg = Config(provider="mock", model="mock", graph_backend="json", data_dir=str(tmp_path))
    app = create_app(cfg, llm=MockLLMClient(scripted={"learning": "You are learning Spanish."}))
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_config_hides_secrets(client):
    body = client.get("/api/config").json()
    assert "api_key" not in body
    assert body["provider"] == "mock"


def test_chat_roundtrip_writes_then_answers(client):
    # statement in -> graph updated
    r1 = client.post("/api/chat", json={"message": "I'm learning Spanish"})
    assert r1.status_code == 200
    graph = client.get("/api/graph").json()
    assert any(n["name"].lower() == "spanish" for n in graph["nodes"])

    # question in -> grounded answer out
    r2 = client.post("/api/chat", json={"message": "what am I learning?"})
    result = [e for e in r2.json()["events"] if e["kind"] == "result"][-1]
    assert "Spanish" in result["text"]


def test_node_edit_and_delete(client):
    client.post("/api/chat", json={"message": "I'm learning Spanish"})
    node = next(n for n in client.get("/api/graph").json()["nodes"] if n["name"] == "Spanish")
    r = client.patch(f"/api/graph/nodes/{node['id']}", json={"props": {"level": "beginner"}})
    assert r.json()["props"]["level"] == "beginner"
    assert client.delete(f"/api/graph/nodes/{node['id']}").status_code == 200
    assert all(n["id"] != node["id"] for n in client.get("/api/graph").json()["nodes"])


def test_websocket_streams_ack_then_result(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"message": "what am I learning?"})
        first = ws.receive_json()
        assert first["kind"] == "ack"
        # drain until result
        kinds = [first["kind"]]
        while "result" not in kinds and "error" not in kinds:
            kinds.append(ws.receive_json()["kind"])
        assert "result" in kinds
