import type { Graph, HealthInfo } from "./types";

// In dev, Vite proxies /api and /ws to the backend; in a packaged build the
// backend is served on the same origin.
const base = "";

export async function getHealth(): Promise<HealthInfo> {
  const r = await fetch(`${base}/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}

export async function getGraph(): Promise<Graph> {
  const r = await fetch(`${base}/api/graph`);
  if (!r.ok) throw new Error(`graph ${r.status}`);
  return r.json();
}

export async function deleteNode(id: string): Promise<void> {
  const r = await fetch(`${base}/api/graph/nodes/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete ${r.status}`);
}

export function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}
