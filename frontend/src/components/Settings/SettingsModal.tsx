import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  getConfig, getModels, testConnection, updateConfig, type AppConfig,
} from "../../lib/api";
import { GlassPanel, PrimaryButton, GhostButton, TextInput, FieldLabel } from "../ui";

const PROVIDER_OPTIONS = [
  { id: "ollama", label: "Ollama (local)" },
  { id: "lmstudio", label: "LM Studio (local)" },
  { id: "openai", label: "OpenAI (cloud)" },
  { id: "anthropic", label: "Anthropic (cloud)" },
  { id: "mock", label: "Demo (offline)" },
];

interface SettingsModalProps {
  onClose: () => void;
  dark: boolean;
  onToggleTheme: () => void;
}

export default function SettingsModal({ onClose, dark, onToggleTheme }: SettingsModalProps) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    getConfig().then(setCfg).catch(() => null);
  }, []);

  useEffect(() => {
    if (!cfg) return;
    getModels(cfg.provider).then((r) => setModels(r.models)).catch(() => setModels([]));
  }, [cfg?.provider]);

  if (!cfg) return null;

  const patch = (p: Partial<AppConfig>) => {
    setCfg({ ...cfg, ...p });
    setSaved(false);
    setTestResult(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await updateConfig({
        provider: cfg.provider,
        model: cfg.model,
        api_base: cfg.api_base,
        temperature: Number(cfg.temperature),
        file_access: cfg.file_access,
      });
      setCfg(next);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await save();
      setTestResult(await testConnection());
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Settings"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <GlassPanel className="max-h-[85vh] overflow-y-auto p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="rounded-lg px-2 py-1 text-slate-400 transition hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <FieldLabel>Provider</FieldLabel>
              <select
                aria-label="Provider"
                value={cfg.provider}
                onChange={(e) => patch({ provider: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2.5 text-sm outline-none focus:border-accent/70"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {cfg.is_cloud && !cfg.has_api_key && (
                <p className="mt-1.5 text-xs text-amber-400">
                  No API key detected — set {cfg.provider.toUpperCase()}_API_KEY in your environment,
                  or Inai will fall back to the offline demo.
                </p>
              )}
            </div>

            <div>
              <FieldLabel>Model</FieldLabel>
              <div className="flex gap-2">
                <select
                  aria-label="Model list"
                  value={models.includes(cfg.model) ? cfg.model : "__custom"}
                  onChange={(e) => e.target.value !== "__custom" && patch({ model: e.target.value })}
                  className="w-1/2 rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2.5 text-sm outline-none focus:border-accent/70"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="__custom">custom…</option>
                </select>
                <TextInput
                  aria-label="Model"
                  value={cfg.model}
                  onChange={(e) => patch({ model: e.target.value })}
                  className="w-1/2"
                />
              </div>
            </div>

            <div>
              <FieldLabel>API base (optional)</FieldLabel>
              <TextInput
                aria-label="API base"
                value={cfg.api_base}
                onChange={(e) => patch({ api_base: e.target.value })}
                placeholder="e.g. http://192.168.1.20:11434"
              />
            </div>

            <div>
              <FieldLabel>Temperature — {cfg.temperature}</FieldLabel>
              <input
                aria-label="Temperature"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={cfg.temperature}
                onChange={(e) => patch({ temperature: Number(e.target.value) })}
                className="w-full accent-[#7c9cff]"
              />
            </div>

            <div className="rounded-xl border border-white/10 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">File access</span>
                  <p className="mt-0.5 text-xs text-slate-500">
                    What Inai may read on this machine. Read-only — revoke anytime.
                  </p>
                </div>
                <select
                  aria-label="File access"
                  value={cfg.file_access}
                  onChange={(e) => patch({ file_access: e.target.value as AppConfig["file_access"] })}
                  className="rounded-lg border border-white/10 bg-ink-900/70 px-2.5 py-1.5 text-xs outline-none focus:border-accent/60"
                >
                  <option value="off">Off — no access</option>
                  <option value="home">Home folder</option>
                  <option value="full">Entire drive</option>
                </select>
              </div>
              {cfg.file_access === "full" && (
                <p className="mt-2 text-xs text-amber-400">
                  Entire-drive access lets Inai read any file your user account can.
                  macOS may still ask separately for protected folders.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
              <span className="text-sm">Theme</span>
              <GhostButton onClick={onToggleTheme} className="!px-3 !py-1.5">
                {dark ? "☾ Dark" : "☀ Light"}
              </GhostButton>
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
              Your memory graph lives in <code className="text-slate-400">data/</code> on this
              machine. Cloud providers only see the current conversation — never your whole brain.
            </p>
          </div>

          <div className="mt-7 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GhostButton onClick={runTest} disabled={testing}>
                {testing ? "Testing…" : "Test"}
              </GhostButton>
              {testResult && (
                <span className={`text-xs ${testResult.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {testResult.ok ? "✓ Connected" : `✗ ${testResult.error ?? "failed"}`}
                </span>
              )}
              {saved && !testResult && <span className="text-xs text-emerald-400">✓ Saved</span>}
            </div>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}
