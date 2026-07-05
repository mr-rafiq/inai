import { useEffect, useState } from "react";
import Orb from "./components/Orb/Orb";
import Chat from "./components/Chat/Chat";
import MemoryView from "./components/Memory/MemoryView";
import { useAssistant } from "./hooks/useAssistant";
import { getHealth } from "./lib/api";
import type { HealthInfo } from "./lib/types";

export default function App() {
  const { messages, orb, connected, graphVersion, send } = useAssistant();
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }, [dark]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, [connected]);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      {/* header */}
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Inai</h1>
          <span className="text-sm text-slate-500">இணை</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span
            data-testid="conn"
            className={connected ? "text-emerald-400" : "text-amber-400"}
          >
            ● {connected ? "connected" : "offline"}
          </span>
          {health && (
            <span className="hidden sm:inline">
              {health.provider}/{health.model}
            </span>
          )}
          <button
            aria-label="Toggle theme"
            onClick={() => setDark((d) => !d)}
            className="rounded-md border border-ink-700 px-2 py-1 hover:border-accent"
          >
            {dark ? "☾" : "☀"}
          </button>
        </div>
      </header>

      {/* main: orb + chat | memory */}
      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[1.6fr_1fr]">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
          <div className="grid place-items-center py-2">
            <Orb state={orb} size={160} />
          </div>
          <div className="min-h-0 flex-1">
            <Chat messages={messages} connected={connected} onSend={send} />
          </div>
        </section>

        <aside className="hidden overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 p-4 md:block">
          <MemoryView version={graphVersion} />
        </aside>
      </main>
    </div>
  );
}
