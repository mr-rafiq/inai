import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage } from "../../lib/types";

interface ChatProps {
  messages: ChatMessage[];
  connected: boolean;
  onSend: (text: string) => void;
}

export default function Chat({ messages, connected, onSend }: ChatProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-slim flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-400">
            Tell Inai something to remember, or ask what it knows.
          </p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                data-role={m.role}
                data-pending={m.pending ? "true" : "false"}
                className={[
                  "max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-accent text-ink-950"
                    : "bg-ink-800 text-slate-100",
                  m.pending ? "italic opacity-70" : "",
                ].join(" ")}
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-2 flex items-center gap-2">
        <input
          aria-label="Message Inai"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Say something to Inai…" : "Connecting…"}
          className="flex-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-ink-950 transition disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
