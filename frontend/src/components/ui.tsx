import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Tiny shared UI kit — keeps the glass look consistent across panels. */

export function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-white/[0.06] bg-white/[0.03] shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-ink-950 shadow-[0_0_24px_rgba(91,124,255,0.35)] transition hover:bg-accent-soft disabled:opacity-40 disabled:shadow-none ${className}`}
    />
  );
}

export function GhostButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl border border-white/10 px-5 py-2.5 text-sm text-slate-300 transition hover:border-accent/60 hover:text-white disabled:opacity-40 ${className}`}
    />
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent/70 focus:shadow-[0_0_0_3px_rgba(91,124,255,0.15)] ${className}`}
    />
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-none rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent/70 focus:shadow-[0_0_0_3px_rgba(91,124,255,0.15)] ${className}`}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">{children}</label>;
}
