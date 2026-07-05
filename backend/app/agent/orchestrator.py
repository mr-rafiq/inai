"""Agent orchestrator (F17, F18).

Responsibilities:
  * classify each turn: memory_write | question | ui_request | action | chit_chat
  * two-tier response: emit an instant lightweight *ack* while the deep path
    (graph traversal + full model) runs, then stream the real answer.

The orchestrator is transport-agnostic: it yields ``TurnEvent`` objects which
``main.py`` forwards over the WebSocket (or collects for REST/tests).
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator

from ..brain.ingest import ingest
from ..brain.retrieve import answer_question
from ..brain.store import GraphStore
from ..llm.client import LLMClient

log = logging.getLogger("inai.agent")


class Intent(str, Enum):
    MEMORY_WRITE = "memory_write"
    QUESTION = "question"
    UI_REQUEST = "ui_request"
    ACTION = "action"
    CHIT_CHAT = "chit_chat"


# Deterministic keyword heuristics keep intent routing testable without a model.
_QUESTION_RE = re.compile(r"^\s*(what|who|when|where|which|how|why|do|does|did|is|are|can|could|tell me|show me)\b", re.I)
_UI_RE = re.compile(r"\b(show|display|render|open|view|board|dashboard|timeline|map)\b", re.I)
_MEMORY_RE = re.compile(
    r"\b(remember|i'm|i am|i'?ve|i have|my |note that|remind me that|i like|i prefer|i watched|i read|i met|learning)\b",
    re.I,
)
_CHITCHAT_RE = re.compile(r"^\s*(hi|hey|hello|thanks|thank you|good (morning|night|evening)|bye)\b", re.I)


def classify_intent(text: str) -> Intent:
    """Fast, deterministic intent routing (heuristic-first)."""
    t = text.strip()
    if _CHITCHAT_RE.search(t) and len(t.split()) <= 4:
        return Intent.CHIT_CHAT
    is_question = t.endswith("?") or bool(_QUESTION_RE.search(t))
    if _UI_RE.search(t) and (is_question or t.lower().startswith(("show", "display", "open", "render"))):
        return Intent.UI_REQUEST
    if is_question:
        return Intent.QUESTION
    if _MEMORY_RE.search(t):
        return Intent.MEMORY_WRITE
    return Intent.CHIT_CHAT


# Light spontaneous acknowledgments per intent (the "think out loud" ack, F18).
_ACKS = {
    Intent.MEMORY_WRITE: "Got it — noting that down…",
    Intent.QUESTION: "Let me check what I remember…",
    Intent.UI_REQUEST: "Sure — pulling that together…",
    Intent.ACTION: "On it…",
    Intent.CHIT_CHAT: "…",
}


@dataclass
class TurnEvent:
    """A single streamed event from processing one user turn."""
    kind: str                       # "ack" | "token" | "result" | "error"
    text: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "text": self.text, "data": self.data}


class Orchestrator:
    def __init__(self, store: GraphStore, llm: LLMClient):
        self.store = store
        self.llm = llm

    async def handle_turn(self, text: str) -> AsyncIterator[TurnEvent]:
        """Yield the two-tier response for one user message."""
        intent = classify_intent(text)
        log.info("turn intent=%s text=%r", intent.value, text)

        # Tier 1: instant acknowledgment.
        yield TurnEvent("ack", _ACKS[intent], {"intent": intent.value})

        # Tier 2: the deep path.
        try:
            if intent is Intent.MEMORY_WRITE:
                result = ingest(text, self.store, self.llm)
                n, e = len(result["nodes_created"]), len(result["edges_created"])
                summary = self._memory_summary(result)
                yield TurnEvent("result", summary, {
                    "intent": intent.value,
                    "nodes_created": result["nodes_created"],
                    "edges_created": result["edges_created"],
                })

            elif intent in (Intent.QUESTION, Intent.UI_REQUEST):
                res = answer_question(text, self.store, self.llm)
                yield TurnEvent("result", res["answer"], {
                    "intent": intent.value,
                    "subgraph": res["subgraph"],
                    "facts": res["facts"],
                })

            else:  # CHIT_CHAT / ACTION fallback -> conversational reply
                reply = self.llm.complete([
                    {"role": "system", "content": "You are Inai, a warm, concise personal assistant."},
                    {"role": "user", "content": text},
                ])
                yield TurnEvent("result", reply, {"intent": intent.value})

        except Exception as exc:  # never crash the socket
            log.exception("turn failed")
            yield TurnEvent("error", f"Sorry — I hit a problem: {exc}", {"intent": intent.value})

    def _memory_summary(self, result: dict[str, Any]) -> str:
        nodes = result["nodes_created"]
        if not nodes and not result["edges_created"]:
            return "I already had that — nothing new to add."
        names = ", ".join(f"{n['name']} ({n['type']})" for n in nodes) or "some connections"
        return f"Remembered: {names}."

    async def collect(self, text: str) -> list[TurnEvent]:
        """Non-streaming helper used by the REST endpoint and tests."""
        return [ev async for ev in self.handle_turn(text)]
