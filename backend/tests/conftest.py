import pytest

from app.config import Config
from app.brain.store import JsonGraphStore
from app.llm.client import MockLLMClient


@pytest.fixture
def cfg(tmp_path):
    return Config(provider="mock", model="mock", graph_backend="json", data_dir=str(tmp_path))


@pytest.fixture
def store(tmp_path):
    return JsonGraphStore(tmp_path / "graph.json")


@pytest.fixture
def llm():
    return MockLLMClient()
