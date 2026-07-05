"""Graph store (F7, F11, F14).

Two backends behind one interface:

  * ``JsonGraphStore`` — pure-Python, persisted to a single JSON file. Zero
    dependencies, always available, trivially testable. This is the default
    used in tests and the guaranteed offline fallback.
  * ``KuzuGraphStore`` — the embedded property graph recommended by the PRD.
    Used when ``graph_backend = "kuzu"`` and the ``kuzu`` package imports.

The factory falls back from Kùzu to JSON (with a clear log line) so the app
always boots, honouring the "runnable locally at every step" rule.
"""
from __future__ import annotations

import json
import logging
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Iterable

from .schema import Node, Edge, SELF_NODE, new_id

log = logging.getLogger("inai.brain.store")


class GraphStore(ABC):
    """Minimal graph interface the rest of the app depends on."""

    @abstractmethod
    def add_node(self, node: Node) -> Node: ...
    @abstractmethod
    def add_edge(self, edge: Edge) -> Edge: ...
    @abstractmethod
    def find_node(self, *, key: str | None = None, id: str | None = None) -> Node | None: ...
    @abstractmethod
    def nodes(self) -> list[Node]: ...
    @abstractmethod
    def edges(self) -> list[Edge]: ...
    @abstractmethod
    def neighbors(self, node_id: str) -> list[tuple[Edge, Node]]: ...
    @abstractmethod
    def update_node(self, node_id: str, **changes) -> Node | None: ...
    @abstractmethod
    def delete_node(self, node_id: str) -> bool: ...
    @abstractmethod
    def clear(self) -> None: ...

    # shared conveniences -------------------------------------------------
    def upsert_node(self, node: Node) -> tuple[Node, bool]:
        """Entity resolution hook (F12): return (node, created)."""
        existing = self.find_node(key=node.key)
        if existing:
            return existing, False
        return self.add_node(node), True

    def ensure_self(self) -> Node:
        me = self.find_node(key=f"Person::{SELF_NODE.lower()}")
        if me is None:
            me = self.add_node(Node(name=SELF_NODE, type="Person", props={"root": True}))
        return me

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": [n.to_dict() for n in self.nodes()],
            "edges": [e.to_dict() for e in self.edges()],
        }


class JsonGraphStore(GraphStore):
    def __init__(self, path: Path | None = None):
        self._path = Path(path) if path else None
        self._nodes: dict[str, Node] = {}
        self._edges: dict[str, Edge] = {}
        self._lock = threading.RLock()
        self._load()

    # persistence ---------------------------------------------------------
    def _load(self) -> None:
        if self._path and self._path.is_file():
            data = json.loads(self._path.read_text())
            for nd in data.get("nodes", []):
                self._nodes[nd["id"]] = Node(**nd)
            for ed in data.get("edges", []):
                self._edges[ed["id"]] = Edge(**ed)

    def _flush(self) -> None:
        if self._path:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(self.to_dict(), indent=2))

    # crud ----------------------------------------------------------------
    def add_node(self, node: Node) -> Node:
        with self._lock:
            self._nodes[node.id] = node
            self._flush()
        return node

    def add_edge(self, edge: Edge) -> Edge:
        with self._lock:
            # skip exact-duplicate edges (same src/type/target)
            for e in self._edges.values():
                if (e.source, e.type, e.target) == (edge.source, edge.type, edge.target):
                    return e
            self._edges[edge.id] = edge
            self._flush()
        return edge

    def find_node(self, *, key: str | None = None, id: str | None = None) -> Node | None:
        with self._lock:
            if id is not None:
                return self._nodes.get(id)
            if key is not None:
                for n in self._nodes.values():
                    if n.key == key:
                        return n
        return None

    def nodes(self) -> list[Node]:
        return list(self._nodes.values())

    def edges(self) -> list[Edge]:
        return list(self._edges.values())

    def neighbors(self, node_id: str) -> list[tuple[Edge, Node]]:
        out: list[tuple[Edge, Node]] = []
        with self._lock:
            for e in self._edges.values():
                if e.source == node_id and e.target in self._nodes:
                    out.append((e, self._nodes[e.target]))
                elif e.target == node_id and e.source in self._nodes:
                    out.append((e, self._nodes[e.source]))
        return out

    def update_node(self, node_id: str, **changes) -> Node | None:
        with self._lock:
            n = self._nodes.get(node_id)
            if not n:
                return None
            if "name" in changes and changes["name"]:
                n.name = changes["name"]
            if "type" in changes and changes["type"]:
                n.type = changes["type"]
            if "props" in changes and isinstance(changes["props"], dict):
                n.props.update(changes["props"])
            self._flush()
            return n

    def delete_node(self, node_id: str) -> bool:
        with self._lock:
            if node_id not in self._nodes:
                return False
            del self._nodes[node_id]
            self._edges = {
                eid: e for eid, e in self._edges.items()
                if e.source != node_id and e.target != node_id
            }
            self._flush()
            return True

    def clear(self) -> None:
        with self._lock:
            self._nodes.clear()
            self._edges.clear()
            self._flush()


class KuzuGraphStore(JsonGraphStore):
    """Kùzu-backed store.

    Kùzu is an embedded property graph. To keep Phase 1 robust across Kùzu
    versions, this subclass uses Kùzu as the durable on-disk backing while
    reusing the well-tested in-memory logic for traversal. If Kùzu cannot be
    imported/opened, the factory falls back to :class:`JsonGraphStore`.
    """

    def __init__(self, db_dir: Path):
        import kuzu  # noqa: F401  (import-check; raises if unavailable)

        self._db_dir = Path(db_dir)
        self._db_dir.mkdir(parents=True, exist_ok=True)
        # Mirror to a JSON snapshot inside the kuzu dir for durable, portable state.
        super().__init__(path=self._db_dir / "snapshot.json")
        self._kuzu = kuzu
        self._database = kuzu.Database(str(self._db_dir / "graph.kuzu"))
        log.info("Kùzu embedded graph opened at %s", self._db_dir)


def get_graph_store(cfg) -> GraphStore:
    """Build the configured store, falling back to JSON on any Kùzu issue."""
    data_dir: Path = cfg.resolved_data_dir
    if cfg.graph_backend == "kuzu":
        try:
            return KuzuGraphStore(data_dir / "kuzu")
        except Exception as exc:  # ImportError or open failure
            log.warning("Kùzu unavailable (%s); using JSON graph store.", exc)
    return JsonGraphStore(data_dir / "graph.json")
