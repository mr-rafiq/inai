import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Orb from "./components/Orb/Orb";
import Chat, { type ChatFocus } from "./components/Chat/Chat";
import MemoryView from "./components/Memory/MemoryView";
import Onboarding from "./components/Onboarding/Onboarding";
import SettingsModal from "./components/Settings/SettingsModal";
import { useAssistant } from "./hooks/useAssistant";
import { getHealth, getProfile, type Profile } from "./lib/api";
import type { HealthInfo } from "./lib/types";

export default function App() {
  const {
    messages, orb, connected, graphVersion, send, refreshGraph,
    sessions, sessionId, switchSession, newSession,
  } = useAssistant();
  const [chatExpanded, setChatExpanded] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [dark, setDark] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(true);
  const [chatFocus, setChatFocus] = useState<ChatFocus | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }, [dark]);

  // Profile gates onboarding; retry while the backend boots behind the proxy.
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      getProfile()
        .then((p) => {
          setProfile(p);
          setProfileLoaded(true);
        })
        .catch(() => {
          if (tries++ < 10) timer = setTimeout(load, Math.min(400 * tries, 3000));
          else setProfileLoaded(true); // give up gracefully; app still usable
        });
    load();
    return () => clearTimeout(timer);
  }, [connected]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, [connected, settingsOpen]);

  const onboarding = profileLoaded && profile !== null && !profile.onboarded;

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(ellipse_at_top,#10142a_0%,#0a0b12_55%,#050609_100%)]">
      {/* The living scene — full-bleed, behind everything */}
      <div className="absolute inset-0 z-0">
        <Orb state={onboarding ? "idle" : orb} fill />
      </div>
      {/* vignette for depth */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(5,6,9,0.55)_100%)]" />

      {!profileLoaded ? (
        <div className="relative z-10 grid h-full place-items-center">
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-64 text-sm tracking-[0.4em] text-slate-400"
          >
            INAI · இணை
          </motion.p>
        </div>
      ) : onboarding ? (
        <Onboarding onComplete={(p) => setProfile(p)} />
      ) : (
        <>
          {/* header */}
          <header className="relative z-10 flex items-center justify-between px-5 py-4 md:px-8">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight">Inai</h1>
              <span className="text-sm text-slate-500">இணை</span>
              {profile?.name && (
                <span className="ml-2 hidden text-xs text-slate-500 sm:inline">
                  with {profile.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                data-testid="conn"
                className={`flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 backdrop-blur-sm ${connected ? "text-emerald-400" : "text-amber-400"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`} />
                {connected ? (health ? `${health.provider} · ${health.model}` : "connected") : "offline"}
              </span>
              <button
                aria-label="Toggle memory panel"
                aria-pressed={brainOpen}
                onClick={() => setBrainOpen((b) => !b)}
                className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-slate-300 backdrop-blur-sm transition hover:border-accent/50 hover:text-white"
              >
                ⊚ Brain
              </button>
              <button
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
                className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-slate-300 backdrop-blur-sm transition hover:border-accent/50 hover:text-white"
              >
                ⚙ Settings
              </button>
            </div>
          </header>

          {/* stage: spacer where the orb lives + chat panel */}
          <main className="relative z-10 flex h-[calc(100%-4.5rem)] flex-col">
            <div className="min-h-0 flex-1" /> {/* the orb breathes here */}

            <div
              className="mx-auto mb-5 flex w-full max-w-2xl px-4 transition-all duration-500"
              style={{ height: chatExpanded ? "88%" : "46%" }}
            >
              <div className="flex w-full flex-col rounded-3xl border border-white/[0.06] bg-ink-950/50 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                {/* chat toolbar: sessions + expand */}
                <div className="mb-1 flex items-center gap-2">
                  <select
                    aria-label="Chat session"
                    value={sessionId ?? ""}
                    onChange={(e) => switchSession(e.target.value)}
                    className="max-w-[45%] rounded-lg border border-white/10 bg-ink-900/70 px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-accent/60"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                  <button
                    aria-label="New chat"
                    onClick={newSession}
                    title="New chat — your brain carries over"
                    className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:border-accent/60 hover:text-white"
                  >
                    + New
                  </button>
                  <button
                    aria-label={chatExpanded ? "Collapse chat" : "Expand chat"}
                    onClick={() => setChatExpanded((x) => !x)}
                    title={chatExpanded ? "Collapse chat" : "Expand chat"}
                    className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:border-accent/60 hover:text-white"
                  >
                    {chatExpanded ? "⌄ Collapse" : "⌃ Expand"}
                  </button>
                </div>
                <Chat
                  messages={messages}
                  connected={connected}
                  onSend={send}
                  userName={profile?.name}
                  focus={chatFocus}
                  onViewMutate={refreshGraph}
                />
              </div>
            </div>
          </main>

          {/* memory drawer */}
          <AnimatePresence>
            {brainOpen && (
              <motion.aside
                initial={{ x: 360, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 360, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="absolute right-4 top-16 bottom-5 z-20 hidden w-80 rounded-3xl border border-white/[0.06] bg-ink-950/60 p-5 shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl md:block"
              >
                <MemoryView
                  version={graphVersion}
                  connected={connected}
                  onNodeClick={(node) =>
                    setChatFocus({
                      turnId: node.props?.source_turn as string | undefined,
                      text: node.props?.source_text as string | undefined,
                      nonce: Date.now(),
                    })
                  }
                />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* settings */}
          <AnimatePresence>
            {settingsOpen && (
              <SettingsModal
                onClose={() => setSettingsOpen(false)}
                dark={dark}
                onToggleTheme={() => setDark((d) => !d)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
