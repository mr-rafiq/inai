import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, OrbState, TurnEvent } from "../lib/types";
import { getHistory, wsUrl } from "../lib/api";

let uid = 0;
const nextId = () => `m${++uid}`;

/**
 * Drives the conversation over the backend WebSocket and derives the orb state
 * from the two-tier response lifecycle:
 *   send      -> "thinking"
 *   ack       -> pending assistant bubble (still "thinking")
 *   result    -> "speaking" briefly, then "idle"
 */
export function useAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [orb, setOrb] = useState<OrbState>("idle");
  const [connected, setConnected] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0); // bump to refetch memory
  const sockRef = useRef<WebSocket | null>(null);
  const pendingId = useRef<string | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const sock = new WebSocket(wsUrl());
    sockRef.current = sock;
    sock.onopen = () => setConnected(true);
    sock.onclose = () => {
      setConnected(false);
      setTimeout(connect, 1500); // simple auto-reconnect
    };
    sock.onmessage = (e) => {
      const ev: TurnEvent = JSON.parse(e.data);
      handleEvent(ev);
    };
  }, []);

  const handleEvent = useCallback((ev: TurnEvent) => {
    if (ev.kind === "ack") {
      // Adopt the server-assigned turn id onto the just-sent user message, so
      // memory provenance (source_turn) can be matched back to it later.
      const turnId = ev.data.turn_id as string | undefined;
      if (turnId) {
        setMessages((m) => {
          const lastUser = [...m].reverse().find((x) => x.role === "user");
          return lastUser ? m.map((x) => (x === lastUser ? { ...x, id: turnId } : x)) : m;
        });
      }
      const id = nextId();
      pendingId.current = id;
      setMessages((m) => [
        ...m,
        { id, role: "assistant", text: ev.text, pending: true, intent: ev.data.intent },
      ]);
      setOrb("thinking");
      return;
    }
    if (ev.kind === "result" || ev.kind === "error") {
      const pid = pendingId.current;
      const view = (ev.data.view ?? null) as ChatMessage["view"];
      setMessages((m) => {
        if (pid && m.some((x) => x.id === pid)) {
          return m.map((x) =>
            x.id === pid ? { ...x, text: ev.text, pending: false, intent: ev.data.intent, view } : x,
          );
        }
        return [...m, { id: nextId(), role: "assistant", text: ev.text, intent: ev.data.intent, view }];
      });
      pendingId.current = null;
      // a memory write or any turn may have changed the graph -> refetch
      setGraphVersion((v) => v + 1);
      setOrb("speaking");
      if (speakTimer.current) clearTimeout(speakTimer.current);
      speakTimer.current = setTimeout(() => setOrb("idle"), 1400);
    }
  }, []);

  const send = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((m) => [...m, { id: nextId(), role: "user", text: clean }]);
    setOrb("thinking");
    sockRef.current?.send(JSON.stringify({ message: clean }));
  }, []);

  // Load persisted conversation history once (F19) — ids are server turn ids,
  // which memory provenance points at.
  const historyLoaded = useRef(false);
  useEffect(() => {
    if (historyLoaded.current) return;
    historyLoaded.current = true;
    getHistory()
      .then((turns) =>
        setMessages((m) =>
          m.length ? m : turns.map((t) => ({ id: t.id, role: t.role, text: t.content, view: t.view ?? null })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (speakTimer.current) clearTimeout(speakTimer.current);
      sockRef.current?.close();
    };
  }, [connect]);

  // Interactive views (e.g. toggling a task) mutate the graph outside a chat
  // turn — let them request a memory-panel refresh.
  const refreshGraph = useCallback(() => setGraphVersion((v) => v + 1), []);

  return { messages, orb, connected, graphVersion, send, refreshGraph };
}
