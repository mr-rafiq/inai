import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.config import Config
from app.main import create_app
from app.llm.client import MockLLMClient
from app.llm.catalog import list_models, PRESETS


@pytest.fixture
def client(tmp_path, monkeypatch):
    # keep settings writes out of the repo during tests
    monkeypatch.setattr(main_mod, "save_config", lambda cfg: tmp_path / "inai.toml")
    cfg = Config(provider="mock", model="mock", graph_backend="json", data_dir=str(tmp_path))
    app = create_app(cfg, llm=MockLLMClient())
    return TestClient(app)


def test_update_config_switches_provider_and_rebuilds_llm(client):
    r = client.put("/api/config", json={"provider": "mock", "model": "mock-2", "temperature": 0.7})
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "mock-2"
    assert body["temperature"] == 0.7
    assert "api_key" not in body  # still never leaks secrets


def test_update_config_ignores_non_updatable_fields(client):
    before = client.get("/api/config").json()["port"]
    client.put("/api/config", json={"model": "mock"})
    assert client.get("/api/config").json()["port"] == before


def test_config_test_endpoint_reports_ok_for_mock(client):
    r = client.post("/api/config/test")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_models_endpoint_returns_presets(client):
    body = client.get("/api/models", params={"provider": "anthropic"}).json()
    assert body["models"] == PRESETS["anthropic"]
    assert body["source"] == "presets"


def test_list_models_fails_soft_for_dead_local_endpoint():
    out = list_models("ollama", api_base="http://127.0.0.1:1")  # nothing listens here
    assert out["source"] == "presets"
    assert out["models"]  # curated fallback list


def test_profile_onboarding_roundtrip_seeds_graph(client):
    # fresh brain -> not onboarded
    assert client.get("/api/profile").json()["onboarded"] is False

    r = client.post("/api/profile", json={
        "name": "Rafiq",
        "about": "I'm learning Spanish, my friend Alex teaches it",
    })
    body = r.json()
    assert body["onboarded"] is True
    assert body["seeded_nodes"] >= 2  # Spanish + Alex extracted from `about`

    # persisted on the User root node
    profile = client.get("/api/profile").json()
    assert profile == {"name": "Rafiq", "about": "I'm learning Spanish, my friend Alex teaches it", "onboarded": True}

    # and the graph really gained the seeded knowledge
    names = {n["name"] for n in client.get("/api/graph").json()["nodes"]}
    assert {"Spanish", "Alex"} <= names
