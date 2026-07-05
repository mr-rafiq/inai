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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean; // true while this is a light ack awaiting depth
  intent?: string;
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
