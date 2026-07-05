import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum,
} from "d3-force";
import type { Graph, GraphNode } from "../../lib/types";

/**
 * Obsidian-style force-directed memory graph.
 *  - nodes coloured by type, glowing accent halo
 *  - drag nodes, wheel to zoom, drag background to pan
 *  - click a node -> onNodeClick (App jumps to the source chat message)
 */

interface SimNode extends SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  props?: Record<string, unknown>;
  x: number;
  y: number;
}

interface GraphViewProps {
  graph: Graph;
  onNodeClick?: (node: GraphNode) => void;
  /** highlight + focus nodes whose name matches */
  search?: string;
  /** show only this node type (root stays visible) */
  typeFilter?: string | null;
  width?: number;
  height?: number;
}

const TYPE_COLOR: Record<string, string> = {
  Person: "#34d399",
  Skill: "#7c9cff",
  Topic: "#7c9cff",
  Task: "#fbbf24",
  Media: "#f472b6",
  Event: "#38bdf8",
  FinanceItem: "#a3e635",
  Note: "#94a3b8",
  Preference: "#c084fc",
};

export default function GraphView({
  graph, onNodeClick, search = "", typeFilter = null, width, height,
}: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<{ source: SimNode; target: SimNode; type: string }[]>([]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const dragging = useRef<{ node?: SimNode; panStart?: { x: number; y: number; vx: number; vy: number } }>({});

  const W = width ?? 320;
  const H = height ?? 460;

  const q = search.trim().toLowerCase();
  const matches = (n: SimNode) => Boolean(q) && n.name.toLowerCase().includes(q);
  const isVisible = (n: SimNode) =>
    (Boolean(n.props?.root) || !typeFilter || n.type === typeFilter) && (!q || matches(n));
  const isDimmed = (n: SimNode) => (q || typeFilter) && !isVisible(n) && !matches(n);

  // Pan the camera to the first search match so the user can "search to focus".
  useEffect(() => {
    if (!q) return;
    const hit = nodes.find(matches);
    if (hit) {
      setView((v) => ({ ...v, x: W / 2 - hit.x * v.k, y: H / 2 - hit.y * v.k }));
    }
  }, [q, nodes.length]);

  // Deterministic layout: run the simulation to rest synchronously (graphs are
  // small), so there's no RAF loop to manage and jsdom tests stay simple.
  const layoutKey = useMemo(
    () => graph.nodes.map((n) => n.id).join(",") + "|" + graph.edges.map((e) => e.id).join(","),
    [graph],
  );

  useEffect(() => {
    const simNodes: SimNode[] = graph.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + 40 * Math.cos((i / Math.max(graph.nodes.length, 1)) * Math.PI * 2),
      y: H / 2 + 40 * Math.sin((i / Math.max(graph.nodes.length, 1)) * Math.PI * 2),
    }));
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks = graph.edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, type: e.type }));

    const sim = forceSimulation(simNodes)
      .force("link", forceLink(simLinks).distance(80).strength(0.7))
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(28))
      .stop();
    for (let i = 0; i < 220; i++) sim.tick();

    setNodes([...simNodes]);
    setLinks(simLinks);
  }, [layoutKey]);

  // ---- interactions ---------------------------------------------------
  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);
    const hit = nodes.find((n) => Math.hypot(n.x - world.x, n.y - world.y) < 20);
    if (hit) dragging.current = { node: hit };
    else dragging.current = { panStart: { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (d.node) {
      const world = toWorld(e.clientX, e.clientY);
      d.node.x = world.x;
      d.node.y = world.y;
      setNodes((ns) => [...ns]);
    } else if (d.panStart) {
      setView((v) => ({
        ...v,
        x: d.panStart!.vx + (e.clientX - d.panStart!.x),
        y: d.panStart!.vy + (e.clientY - d.panStart!.y),
      }));
    }
  };

  const onPointerUp = () => (dragging.current = {});

  const onWheel = (e: React.WheelEvent) => {
    const k = Math.max(0.4, Math.min(2.5, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, k }));
  };

  if (graph.nodes.length === 0) {
    return (
      <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
        Nothing here yet.<br />Tell Inai about your world and watch it grow.
      </p>
    );
  }

  return (
    <svg
      ref={svgRef}
      data-testid="memory-graph"
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {/* edges */}
        {links.map((l, i) => {
          const dim = isDimmed(l.source) || isDimmed(l.target);
          return (
            <g key={i} opacity={dim ? 0.12 : 1}>
              <line
                x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
                stroke="rgba(124,156,255,0.25)" strokeWidth={1.2}
              />
              <text
                x={(l.source.x + l.target.x) / 2}
                y={(l.source.y + l.target.y) / 2 - 4}
                textAnchor="middle"
                className="pointer-events-none"
                fontSize={7}
                fill="rgba(148,163,184,0.55)"
              >
                {l.type.toLowerCase().replace("_", " ")}
              </text>
            </g>
          );
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const isRoot = Boolean(n.props?.root);
          const color = isRoot ? "#dbe4ff" : TYPE_COLOR[n.type] ?? "#94a3b8";
          const r = isRoot ? 14 : 10;
          const hit = matches(n);
          return (
            <g
              key={n.id}
              data-node-name={n.name}
              transform={`translate(${n.x},${n.y})`}
              className="cursor-pointer"
              opacity={isDimmed(n) ? 0.18 : 1}
              onClick={() => !isRoot && onNodeClick?.(n)}
              role="button"
              aria-label={`Memory: ${n.name}`}
            >
              {hit && <circle r={r + 9} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />}
              <circle r={r + 6} fill={color} opacity={hit ? 0.25 : 0.12} />
              <circle r={r} fill={color} opacity={0.9} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
              <text
                y={r + 12}
                textAnchor="middle"
                fontSize={9}
                fill="rgba(226,232,240,0.9)"
                className="pointer-events-none"
              >
                {n.name.length > 14 ? n.name.slice(0, 13) + "…" : n.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
