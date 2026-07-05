"""Ingestion pipeline (F9, F12).

An LLM call extracts ``(entities, relationships)`` from a user statement as
structured JSON; a deterministic layer then validates and writes them, doing
entity resolution so we never create five nodes for one person.

Every write is logged for debuggability (PRD §7.2).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..llm.client import LLMClient
from .schema import (
    Node, Edge, SELF_NODE, NODE_TYPES, EDGE_TYPES,
    validate_node_type, validate_edge_type,
)
from .store import GraphStore

log = logging.getLogger("inai.brain.ingest")

_EXTRACT_SYSTEM = """You are the memory extractor for a personal assistant. EXTRACT_JSON.
From the user's statement, extract entities and relationships for a knowledge graph.

Allowed node types: {nodes}
Allowed edge types: {edges}
The user themselves is the node named "User" (type Person).

Return ONLY minified JSON of the form:
{{"entities":[{{"name":"...","type":"..."}}],"relationships":[{{"source":"...","type":"...","target":"..."}}]}}
Use "User" as the source when the statement is about the user. Do not invent facts."""


def _extract_prompt(text: str) -> list[dict[str, str]]:
    system = _EXTRACT_SYSTEM.format(
        nodes=", ".join(sorted(NODE_TYPES)),
        edges=", ".join(sorted(EDGE_TYPES)),
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]


def _parse_json(raw: str) -> dict[str, Any]:
    """Tolerant JSON parse — models sometimes wrap output in prose/fences."""
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return {"entities": [], "relationships": []}
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {"entities": [], "relationships": []}
    data.setdefault("entities", [])
    data.setdefault("relationships", [])
    return data


def extract(text: str, llm: LLMClient) -> dict[str, Any]:
    """Call the LLM and return validated {entities, relationships}."""
    raw = llm.complete(_extract_prompt(text))
    data = _parse_json(raw)
    entities, rels = [], []
    for e in data.get("entities", []):
        name, typ = str(e.get("name", "")).strip(), str(e.get("type", "")).strip().title()
        if not name:
            continue
        if typ not in NODE_TYPES:
            typ = "Note"  # graceful bucket rather than dropping data
        entities.append({"name": name, "type": typ})
    for r in data.get("relationships", []):
        typ = str(r.get("type", "")).strip().upper()
        src, tgt = str(r.get("source", "")).strip(), str(r.get("target", "")).strip()
        if not (src and tgt) or typ not in EDGE_TYPES:
            continue
        rels.append({"source": src, "type": typ, "target": tgt})
    return {"entities": entities, "relationships": rels}


def _resolve(store: GraphStore, name: str, default_type: str) -> Node:
    """Find-or-create a node by name (entity resolution / dedup, F12)."""
    if name.strip().lower() == SELF_NODE.lower():
        return store.ensure_self()
    # try each known type for an existing node with this name
    for t in NODE_TYPES:
        hit = store.find_node(key=f"{t}::{name.strip().lower()}")
        if hit:
            return hit
    node, _ = store.upsert_node(Node(name=name, type=validate_node_type(default_type)))
    return node


def ingest(text: str, store: GraphStore, llm: LLMClient) -> dict[str, Any]:
    """Extract from ``text`` and write nodes/edges into ``store``.

    Returns a summary of what was written (for logging + the UI).
    """
    store.ensure_self()
    data = extract(text, llm)

    # name -> declared type, so relationship endpoints get the right type
    type_of: dict[str, str] = {e["name"].lower(): e["type"] for e in data["entities"]}

    created_nodes: list[Node] = []
    for e in data["entities"]:
        node, created = store.upsert_node(Node(name=e["name"], type=e["type"]))
        if created:
            created_nodes.append(node)
            log.info("WRITE node %s (%s)", node.name, node.type)

    created_edges: list[Edge] = []
    for r in data["relationships"]:
        src = _resolve(store, r["source"], type_of.get(r["source"].lower(), "Note"))
        tgt = _resolve(store, r["target"], type_of.get(r["target"].lower(), "Note"))
        edge = store.add_edge(Edge(source=src.id, target=tgt.id, type=validate_edge_type(r["type"])))
        created_edges.append(edge)
        log.info("WRITE edge (%s)-[%s]->(%s)", src.name, edge.type, tgt.name)

    return {
        "nodes_created": [n.to_dict() for n in created_nodes],
        "edges_created": [e.to_dict() for e in created_edges],
        "extracted": data,
    }
