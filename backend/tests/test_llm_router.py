import pytest

from app.config import Config
from app.llm.client import (
    get_llm_client, MockLLMClient, LiteLLMClient, LLMConfigError, _model_string,
)


def test_mock_provider_returns_mock_client():
    c = Config(provider="mock")
    assert isinstance(get_llm_client(c), MockLLMClient)


def test_cloud_without_key_raises(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    c = Config(provider="openai", model="gpt-4o-mini")
    with pytest.raises(LLMConfigError):
        get_llm_client(c)


def test_cloud_with_key_selects_litellm(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    c = Config(provider="openai", model="gpt-4o-mini")
    client = get_llm_client(c)
    assert isinstance(client, LiteLLMClient)
    assert client.name == "openai:gpt-4o-mini"


@pytest.mark.parametrize("provider,model,expected", [
    ("ollama", "llama3.2", "ollama/llama3.2"),
    ("lmstudio", "qwen2.5", "openai/qwen2.5"),
    ("anthropic", "claude-sonnet-5", "anthropic/claude-sonnet-5"),
    ("openai", "gpt-4o", "gpt-4o"),
])
def test_model_string_mapping(provider, model, expected):
    assert _model_string(Config(provider=provider, model=model)) == expected


def test_mock_stream_reassembles_to_complete():
    m = MockLLMClient()
    msgs = [{"role": "user", "content": "hello there"}]
    streamed = "".join(m.stream(msgs))
    assert "hello there" in streamed


def test_mock_scripted_response():
    m = MockLLMClient(scripted={"weather": "It is sunny."})
    out = m.complete([{"role": "user", "content": "hows the weather"}])
    assert out == "It is sunny."


def test_friendly_llm_errors_are_actionable():
    from app.llm.client import friendly_llm_error

    assert "ollama serve" in friendly_llm_error(
        "ollama", "litellm.APIConnectionError: OllamaException - [Errno 61] Connection refused"
    )
    assert "Developer tab" in friendly_llm_error(
        "lmstudio", "APIConnectionError: Connection refused"
    )
    assert "OPENAI_API_KEY" in friendly_llm_error(
        "openai", "OpenAIException - Missing credentials. Please pass an `api_key`"
    )
    assert "ollama pull" in friendly_llm_error("ollama", 'model "qwen9" not found')
    # unknown errors pass through untouched
    assert friendly_llm_error("openai", "some novel failure") == "some novel failure"
