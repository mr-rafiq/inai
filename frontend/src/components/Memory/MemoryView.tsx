import { useEffect, useState } from "react";
import type { Graph } from "../../lib/types";
import { getGraph, deleteNode } from "../../lib/api";

interface MemoryViewProps {
  version: number; // bump to refetch
}

const TYPE_COLOR: Record<string, string> = {
  Person: "text-emerald-300",
  Skill: "text-accent-soft",
  Topic: "text-accent-soft",
  Task: "text-amber-300",
  Media: "text-pink-300",
  Event: "text-sky-300",
};

export default function MemoryView({ version }: MemoryViewProps) {
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    getGraph()
      .then((g) => {
        setGraph(g);
        setError(null);
      })
      .catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
  }, [version]);

  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? "?";

  return (
    <div className="scroll-slim h-full overflow-y-auto">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Memory graph
        </h2>
        <span className="text-xs text-slate-500">{graph.nodes.length} nodes</span>
      </div>

      {error && <p className="text-xs text-rose-400">Couldn’t load memory: {error}</p>}

      <ul className="space-y-1.5">
        {graph.nodes.map((n) => (
          <li
            key={n.id}
            data-node-name={n.name}
            className="group flex items-center justify-between rounded-lg bg-ink-900/60 px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium">{n.name}</span>{" "}
              <span className={`text-xs ${TYPE_COLOR[n.type] ?? "text-slate-400"}`}>
                {n.type}
              </span>
            </span>
            {!n.props?.root && (
              <button
                aria-label={`Delete ${n.name}`}
                onClick={() => deleteNode(n.id).then(refresh)}
                className="text-xs text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {graph.edges.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Connections
          </h3>
          <ul className="space-y-1 text-xs text-slate-400">
            {graph.edges.map((e) => (
              <li key={e.id}>
                {nameOf(e.source)} <span className="text-accent-soft">—{e.type}→</span>{" "}
                {nameOf(e.target)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
