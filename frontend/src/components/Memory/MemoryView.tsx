import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Graph, GraphNode } from "../../lib/types";
import { getGraph, deleteNode } from "../../lib/api";
import GraphView from "./GraphView";

interface MemoryViewProps {
  version: number;      // bump to refetch
  connected: boolean;   // refetch when the backend (re)connects
  onNodeClick?: (node: GraphNode) => void;
}

const TYPE_STYLE: Record<string, string> = {
  Person: "bg-emerald-400/10 text-emerald-300",
  Skill: "bg-accent/10 text-accent-soft",
  Topic: "bg-accent/10 text-accent-soft",
  Task: "bg-amber-400/10 text-amber-300",
  Media: "bg-pink-400/10 text-pink-300",
  Event: "bg-sky-400/10 text-sky-300",
  FinanceItem: "bg-lime-400/10 text-lime-300",
};

export default function MemoryView({ version, connected, onNodeClick }: MemoryViewProps) {
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"graph" | "list">("graph");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Retry with backoff: at app start the backend may still be booting behind
  // the dev proxy (this was the "graph 500" bug) — keep trying, don't give up.
  const refresh = () => {
    getGraph()
      .then((g) => {
        setGraph(g);
        setError(null);
        retries.current = 0;
      })
      .catch((e) => {
        setError(String(e));
        if (retries.current < 8) {
          const delay = Math.min(500 * 2 ** retries.current, 5000);
          retries.current += 1;
          timer.current = setTimeout(refresh, delay);
        }
      });
  };

  useEffect(() => {
    retries.current = 0;
    refresh();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [version, connected]);

  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? "?";
  const visible = graph.nodes.filter((n) => !n.props?.root);
  const categories = [...new Set(visible.map((n) => n.type))].sort();
  const listVisible = visible.filter(
    (n) =>
      (!typeFilter || n.type === typeFilter) &&
      (!search || n.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="scroll-slim h-full overflow-y-auto pr-1">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Your brain
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/10 p-0.5 text-[10px]">
            <button
              onClick={() => setMode("graph")}
              aria-pressed={mode === "graph"}
              className={`rounded-full px-2.5 py-1 transition ${mode === "graph" ? "bg-accent/25 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Graph
            </button>
            <button
              onClick={() => setMode("list")}
              aria-pressed={mode === "list"}
              className={`rounded-full px-2.5 py-1 transition ${mode === "list" ? "bg-accent/25 text-white" : "text-slate-400 hover:text-white"}`}
            >
              List
            </button>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-slate-400">
            {visible.length}
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          Reconnecting to your memory…
        </p>
      )}

      {/* brain explorer controls: search-to-focus + category filters */}
      {visible.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex gap-2">
            <input
              aria-label="Search memories"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your brain…"
              className="w-full rounded-lg border border-white/10 bg-ink-900/70 px-3 py-1.5 text-xs outline-none placeholder:text-slate-500 focus:border-accent/60"
            />
            {mode === "graph" && (
              <button
                aria-label="Expand graph"
                title="Full-screen graph"
                onClick={() => setExpanded(true)}
                className="shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-300 transition hover:border-accent/60 hover:text-white"
              >
                ⛶
              </button>
            )}
          </div>
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setTypeFilter(typeFilter === c ? null : c)}
                  aria-pressed={typeFilter === c}
                  className={`rounded-full px-2 py-0.5 text-[10px] transition ${
                    typeFilter === c
                      ? "bg-accent/30 text-white"
                      : "bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "graph" && !error && (
        <>
          <GraphView graph={graph} onNodeClick={onNodeClick} search={search} typeFilter={typeFilter} />
          {visible.length > 0 && (
            <p className="mt-2 text-center text-[10px] text-slate-500">
              drag to move · wheel to zoom · click a node to jump to its chat
            </p>
          )}
        </>
      )}

      {/* full-screen brain explorer — portaled to <body>: the drawer has a
          framer-motion transform, which would trap position:fixed inside it */}
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-label="Brain explorer"
        >
          <div
            className="flex h-full w-full max-w-6xl flex-col rounded-3xl border border-white/[0.08] bg-ink-950/90 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold tracking-wide">Brain explorer</h2>
              <input
                aria-label="Search brain explorer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search to focus…"
                className="w-64 rounded-lg border border-white/10 bg-ink-900/70 px-3 py-1.5 text-xs outline-none placeholder:text-slate-500 focus:border-accent/60"
              />
              <div className="flex flex-wrap gap-1">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTypeFilter(typeFilter === c ? null : c)}
                    className={`rounded-full px-2.5 py-1 text-[10px] transition ${
                      typeFilter === c ? "bg-accent/30 text-white" : "bg-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                aria-label="Close brain explorer"
                onClick={() => setExpanded(false)}
                className="ml-auto rounded-lg px-2 py-1 text-slate-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <GraphView
                graph={graph}
                onNodeClick={(n) => {
                  setExpanded(false);
                  onNodeClick?.(n);
                }}
                search={search}
                typeFilter={typeFilter}
                width={1100}
                height={640}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {mode === "list" && visible.length === 0 && !error && (
        <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
          Nothing here yet.<br />Tell Inai about your world and watch it grow.
        </p>
      )}

      {mode === "list" && (
      <ul className="space-y-2">
        {listVisible.map((n) => (
          <li
            key={n.id}
            data-node-name={n.name}
            className="group flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.03] px-3.5 py-2.5 text-sm transition hover:border-white/10"
          >
            <span className="flex items-center gap-2.5">
              <span className="font-medium">{n.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLE[n.type] ?? "bg-white/5 text-slate-400"}`}
              >
                {n.type}
              </span>
            </span>
            <button
              aria-label={`Delete ${n.name}`}
              onClick={() => deleteNode(n.id).then(refresh)}
              className="text-xs text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      )}

      {mode === "list" && graph.edges.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Connections
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-400">
            {graph.edges.map((e) => (
              <li key={e.id} className="rounded-lg bg-white/[0.02] px-3 py-1.5">
                {nameOf(e.source)}{" "}
                <span className="mx-1 text-accent-soft/80">{e.type.toLowerCase().replace("_", " ")}</span>{" "}
                {nameOf(e.target)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
