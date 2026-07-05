import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getModels, saveProfile, testConnection, updateConfig, type Profile } from "../../lib/api";
import { GlassPanel, PrimaryButton, GhostButton, TextInput, TextArea, FieldLabel } from "../ui";

/**
 * First-run onboarding (F5): learn who the user is, seed the brain from their
 * own words, and let them pick the model that powers Inai.
 */

const PROVIDERS = [
  { id: "ollama", title: "Ollama", tag: "Local · private", desc: "Runs models on this machine. Nothing leaves your device." },
  { id: "lmstudio", title: "LM Studio", tag: "Local · private", desc: "Uses LM Studio's local server on port 1234." },
  { id: "openai", title: "OpenAI", tag: "Cloud", desc: "Needs OPENAI_API_KEY in your environment." },
  { id: "anthropic", title: "Anthropic", tag: "Cloud", desc: "Needs ANTHROPIC_API_KEY in your environment." },
  { id: "mock", title: "Demo", tag: "No model", desc: "Offline demo brain — try Inai without any model installed." },
];

const stepAnim = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
  transition: { duration: 0.35, ease: "easeOut" },
};

interface OnboardingProps {
  onComplete: (profile: Profile) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsSource, setModelsSource] = useState("presets");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getModels(provider)
      .then((r) => {
        setModels(r.models);
        setModelsSource(r.source);
        setModel((m) => (r.models.includes(m) ? m : r.models[0] ?? ""));
      })
      .catch(() => setModels([]));
    setTestResult(null);
  }, [provider]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await updateConfig({ provider, model });
      setTestResult(await testConnection());
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await updateConfig({ provider, model });
      const profile = await saveProfile(name, about);
      onComplete(profile);
    } catch (e) {
      setError(`Couldn't finish setup: ${e}`);
      setFinishing(false);
    }
  };

  return (
    <div className="relative z-10 grid h-full place-items-center p-6">
      <GlassPanel className="w-full max-w-xl p-8 md:p-10">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="welcome" {...stepAnim} className="text-center">
              <p className="text-sm tracking-[0.3em] text-accent-soft">இணை</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Hello, I'm Inai.</h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
                Your local-first second brain. Everything you tell me becomes a connected
                network of memory — private, on your machine, yours. Let's take a minute
                to set things up.
              </p>
              <PrimaryButton className="mt-8" onClick={() => setStep(1)}>
                Get started
              </PrimaryButton>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="about" {...stepAnim}>
              <h2 className="text-xl font-semibold">First — who are you?</h2>
              <p className="mt-1 text-sm text-slate-400">
                I'll seed your memory graph from this, so speak naturally.
              </p>
              <div className="mt-6 space-y-5">
                <div>
                  <FieldLabel>What should I call you?</FieldLabel>
                  <TextInput
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    aria-label="Your name"
                  />
                </div>
                <div>
                  <FieldLabel>Tell me a bit about yourself</FieldLabel>
                  <TextArea
                    rows={4}
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    placeholder="What do you do? What are you learning? Who and what matters to you right now?"
                    aria-label="About you"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Optional — but each fact becomes a node in your brain.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex justify-between">
                <GhostButton onClick={() => setStep(0)}>Back</GhostButton>
                <PrimaryButton disabled={!name.trim()} onClick={() => setStep(2)}>
                  Continue
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="model" {...stepAnim}>
              <h2 className="text-xl font-semibold">Choose your mind</h2>
              <p className="mt-1 text-sm text-slate-400">
                Pick the model that powers Inai — switchable anytime in Settings.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    aria-pressed={provider === p.id}
                    className={`rounded-2xl border p-3.5 text-left transition ${
                      provider === p.id
                        ? "border-accent/70 bg-accent/10 shadow-[0_0_20px_rgba(91,124,255,0.15)]"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold">{p.title}</span>
                      <span className="text-[10px] uppercase tracking-wider text-accent-soft">{p.tag}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-400">{p.desc}</p>
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <FieldLabel>
                  Model{" "}
                  <span className="normal-case text-slate-500">
                    ({modelsSource === "live" ? "installed models" : "suggestions"})
                  </span>
                </FieldLabel>
                <div className="flex gap-2">
                  <select
                    aria-label="Model"
                    value={models.includes(model) ? model : "__custom"}
                    onChange={(e) => e.target.value !== "__custom" && setModel(e.target.value)}
                    className="w-1/2 rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2.5 text-sm outline-none focus:border-accent/70"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__custom">custom…</option>
                  </select>
                  <TextInput
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="model name"
                    aria-label="Model name"
                    className="w-1/2"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <GhostButton onClick={runTest} disabled={testing || !model}>
                  {testing ? "Testing…" : "Test connection"}
                </GhostButton>
                {testResult && (
                  <span className={`text-xs ${testResult.ok ? "text-emerald-400" : "text-rose-400"}`}>
                    {testResult.ok ? "✓ Connected" : `✗ ${testResult.error ?? "failed"}`}
                  </span>
                )}
              </div>

              {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

              <div className="mt-8 flex justify-between">
                <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
                <PrimaryButton disabled={!model || finishing} onClick={finish}>
                  {finishing ? "Seeding your brain…" : "Start using Inai"}
                </PrimaryButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* step dots */}
        <div className="mt-8 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-accent" : "w-1.5 bg-white/15"}`}
            />
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
