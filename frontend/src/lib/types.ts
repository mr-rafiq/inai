export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export type TurnEventKind = "ack" | "token" | "result" | "error";

export interface TurnEvent {
  kind: TurnEventKind;
  text: string;
  data: Record<string, unknown> & {
    intent?: string;
    subgraph?: Graph;
    nodes_created?: GraphNode[];
    edges_created?: GraphEdge[];
  };
}

// Structured views the assistant can render in chat (generative UI, F27/F29).
export interface FileEntry {
  name: string;
  kind: "dir" | "file";
  size: number | null;
  suffix: string;
}

export type ViewSpec =
  | { type: "file_list"; path: string; entries: FileEntry[]; total: number }
  | { type: "file_content"; path: string; content: string; truncated?: boolean }
  | { type: "task_list"; tasks: GraphNode[] };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean; // true while this is a light ack awaiting depth
  intent?: string;
  view?: ViewSpec | null;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  props?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface HealthInfo {
  status: string;
  provider: string;
  model: string;
  llm: string;
  graph_backend: string;
  nodes: number;
}
