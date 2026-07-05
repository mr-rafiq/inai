"""Graph schema (F8): typed nodes and relationships.

Keeping the schema in one place lets the ingestion layer validate LLM output
deterministically before anything is written to the graph.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any

# Starter node + edge vocabulary from the PRD (§7.2).
NODE_TYPES: set[str] = {
    "Person", "Task", "Topic", "Skill", "Media",
    "FinanceItem", "Event", "Note", "Preference",
}

EDGE_TYPES: set[str] = {
    "KNOWS", "LEARNING", "WATCHED", "ASSIGNED_TO", "RELATES_TO",
    "PART_OF", "DUE_ON", "SPENT_ON", "PREFERS", "HAS_TASK",
}

# The implicit root node representing the app's owner.
SELF_NODE = "User"


def _now() -> float:
    # NOTE: time.time() is fine at runtime; tests pin/patch where determinism matters.
    return time.time()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def validate_node_type(t: str) -> str:
    if t not in NODE_TYPES:
        raise ValueError(f"unknown node type: {t!r} (allowed: {sorted(NODE_TYPES)})")
    return t


def validate_edge_type(t: str) -> str:
    if t not in EDGE_TYPES:
        raise ValueError(f"unknown edge type: {t!r} (allowed: {sorted(EDGE_TYPES)})")
    return t


@dataclass
class Node:
    name: str
    type: str
    id: str = field(default_factory=new_id)
    props: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=_now)

    @property
    def key(self) -> str:
        """Identity key used for deduplication (type + normalised name)."""
        return f"{self.type}::{self.name.strip().lower()}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Edge:
    source: str  # node id
    target: str  # node id
    type: str
    id: str = field(default_factory=new_id)
    props: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
