import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage } from "../../lib/types";

interface ChatProps {
  messages: ChatMessage[];
  connected: boolean;
  onSend: (text: string) => void;
  userName?: string;
}

export default function Chat({ messages, connected, onSend, userName }: ChatProps) {
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
      <div className="scroll-slim flex-1 space-y-3 overflow-y-auto px-1 py-3">
        {messages.length === 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-300">
              {userName ? `Hi ${userName}.` : "Hi."} What's on your mind?
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Try “remember that…”, or ask “what do you know about me?”
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                data-role={m.role}
                data-pending={m.pending ? "true" : "false"}
                className={[
                  "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-accent/90 text-ink-950 shadow-[0_2px_16px_rgba(91,124,255,0.25)]"
                    : "border border-white/[0.05] bg-white/[0.05] text-slate-100 backdrop-blur-sm",
                  m.pending ? "animate-pulse text-slate-300" : "",
                ].join(" ")}
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 pt-1">
        <input
          aria-label="Message Inai"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Say something to Inai…" : "Connecting…"}
          className="flex-1 rounded-2xl border border-white/10 bg-ink-900/80 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-accent/70 focus:shadow-[0_0_0_3px_rgba(91,124,255,0.12)]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-ink-950 shadow-[0_0_20px_rgba(91,124,255,0.3)] transition hover:bg-accent-soft disabled:opacity-40 disabled:shadow-none"
        >
          Send
        </button>
      </form>
    </div>
  );
}
