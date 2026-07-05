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

export async function updateNode(
  id: string,
  patch: { name?: string; type?: string; props?: Record<string, unknown> },
): Promise<void> {
  const r = await fetch(`${base}/api/graph/nodes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`update ${r.status}`);
}

export function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export interface HistoryTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  view?: import("./types").ViewSpec | null;
}

export async function getHistory(sessionId?: string): Promise<HistoryTurn[]> {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const r = await fetch(`${base}/api/history${qs}`);
  if (!r.ok) throw new Error(`history ${r.status}`);
  return (await r.json()).history;
}

// ---- chat sessions (one shared brain) ---------------------------------------

export interface ChatSession {
  id: string;
  title: string;
  count: number;
}

export async function getSessions(): Promise<ChatSession[]> {
  const r = await fetch(`${base}/api/sessions`);
  if (!r.ok) throw new Error(`sessions ${r.status}`);
  return (await r.json()).sessions;
}

export async function createSession(): Promise<ChatSession> {
  const r = await fetch(`${base}/api/sessions`, { method: "POST" });
  if (!r.ok) throw new Error(`sessions ${r.status}`);
  return r.json();
}

// ---- profile / onboarding --------------------------------------------------

export interface Profile {
  name: string;
  about: string;
  onboarded: boolean;
}

export async function getProfile(): Promise<Profile> {
  const r = await fetch(`${base}/api/profile`);
  if (!r.ok) throw new Error(`profile ${r.status}`);
  return r.json();
}

export async function saveProfile(name: string, about: string): Promise<Profile> {
  const r = await fetch(`${base}/api/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, about }),
  });
  if (!r.ok) throw new Error(`profile ${r.status}`);
  return r.json();
}

// ---- settings ---------------------------------------------------------------

export interface AppConfig {
  provider: string;
  model: string;
  fast_model: string;
  api_base: string;
  temperature: number;
  file_access: "off" | "home" | "full";
  is_cloud: boolean;
  has_api_key: boolean;
}

export async function getConfig(): Promise<AppConfig> {
  const r = await fetch(`${base}/api/config`);
  if (!r.ok) throw new Error(`config ${r.status}`);
  return r.json();
}

export async function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const r = await fetch(`${base}/api/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`config ${r.status}`);
  return r.json();
}

export async function getModels(provider: string): Promise<{ models: string[]; source: string }> {
  const r = await fetch(`${base}/api/models?provider=${encodeURIComponent(provider)}`);
  if (!r.ok) throw new Error(`models ${r.status}`);
  return r.json();
}

export async function testConnection(): Promise<{ ok: boolean; llm: string; error?: string }> {
  const r = await fetch(`${base}/api/config/test`, { method: "POST" });
  if (!r.ok) throw new Error(`test ${r.status}`);
  return r.json();
}
