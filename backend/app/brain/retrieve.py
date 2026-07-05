"""Graph retrieval (F10).

Given a question we (1) pick start nodes by keyword/name match, (2) expand a
few hops to build a relevant subgraph, then (3) let the LLM explain that
subgraph. The subgraph is always returned so the UI can show provenance and
so tests can assert on real graph data without the LLM.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from ..llm.client import LLMClient
from .schema import Node, Edge, SELF_NODE
from .store import GraphStore

log = logging.getLogger("inai.brain.retrieve")

_STOP = {
    "what", "who", "when", "where", "which", "how", "is", "are", "am", "do",
    "does", "did", "the", "a", "an", "my", "me", "i", "of", "to", "in", "on",
    "about", "know", "tell", "show", "whats", "whos", "and", "for", "with",
    "your", "you", "have", "has", "was", "were", "any", "this", "that",
}


def _keywords(question: str) -> list[str]:
    toks = re.findall(r"[a-z0-9]+", question.lower())
    return [t for t in toks if t not in _STOP and len(t) > 1]


def retrieve(question: str, store: GraphStore, hops: int = 1) -> dict[str, Any]:
    """Return a subgraph {nodes, edges, start_ids} relevant to the question."""
    kws = _keywords(question)
    nodes_by_id = {n.id: n for n in store.nodes()}

    # start nodes: name keyword-matches, plus the always-relevant User root.
    start: dict[str, Node] = {}
    for n in nodes_by_id.values():
        nl = n.name.lower()
        if any(k in nl or nl in k for k in kws):
            start[n.id] = n
    me = store.find_node(key=f"Person::{SELF_NODE.lower()}")
    if me:
        start.setdefault(me.id, me)

    # BFS expansion up to `hops`.
    frontier = set(start)
    seen_nodes: dict[str, Node] = dict(start)
    seen_edges: dict[str, Edge] = {}
    for _ in range(hops):
        nxt: set[str] = set()
        for nid in frontier:
            for edge, other in store.neighbors(nid):
                seen_edges[edge.id] = edge
                if other.id not in seen_nodes:
                    seen_nodes[other.id] = other
                    nxt.add(other.id)
        frontier = nxt

    return {
        "nodes": [n.to_dict() for n in seen_nodes.values()],
        "edges": [e.to_dict() for e in seen_edges.values()],
        "start_ids": list(start),
        "keywords": kws,
    }


def subgraph_to_text(sub: dict[str, Any]) -> str:
    """Render a subgraph as readable triples for the LLM / for tests."""
    by_id = {n["id"]: n for n in sub["nodes"]}
    lines = []
    for e in sub["edges"]:
        s = by_id.get(e["source"], {}).get("name", "?")
        t = by_id.get(e["target"], {}).get("name", "?")
        lines.append(f"{s} -{e['type']}-> {t}")
    if not lines:
        lines = [f"{n['name']} ({n['type']})" for n in sub["nodes"]]
    return "\n".join(lines) if lines else "(nothing relevant in memory)"


def answer_question(question: str, store: GraphStore, llm: LLMClient) -> dict[str, Any]:
    """Full retrieval → grounded answer. Returns {answer, subgraph, facts}."""
    sub = retrieve(question, store)
    facts = subgraph_to_text(sub)
    messages = [
        {
            "role": "system",
            "content": (
                "You are Inai, a personal assistant answering from the user's memory graph. "
                "Answer using ONLY the facts below. If the facts don't contain the answer, "
                "say you don't have that in memory yet. Be concise.\n\nMEMORY FACTS:\n" + facts
            ),
        },
        {"role": "user", "content": question},
    ]
    answer = llm.complete(messages)
    log.info("ANSWER q=%r facts=%d nodes", question, len(sub["nodes"]))
    return {"answer": answer, "subgraph": sub, "facts": facts}
