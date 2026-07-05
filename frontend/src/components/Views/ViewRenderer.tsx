import { useState } from "react";
import type { ViewSpec, FileEntry, GraphNode } from "../../lib/types";
import { updateNode } from "../../lib/api";

/**
 * Generative UI (F27/F29): renders the assistant's structured views inside
 * chat — a real file browser row-list instead of a wall of text, file
 * contents as a code block, and an interactive task list whose checkboxes
 * write back into the graph (F31).
 */

const ICONS: Record<string, string> = {
  ".png": "🖼", ".jpg": "🖼", ".jpeg": "🖼", ".gif": "🖼", ".svg": "🖼",
  ".pdf": "📕", ".doc": "📘", ".docx": "📘", ".xls": "📗", ".xlsx": "📗",
  ".csv": "📊", ".zip": "🗜", ".dmg": "💿", ".app": "⚙️",
  ".mp3": "🎵", ".wav": "🎵", ".mp4": "🎬", ".mov": "🎬",
  ".py": "🐍", ".js": "📜", ".ts": "📜", ".tsx": "📜", ".json": "📜",
  ".md": "📝", ".txt": "📝",
};

function fmtSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function FileListView({ path, entries, total }: { path: string; entries: FileEntry[]; total: number }) {
  const [filter, setFilter] = useState("");
  const shown = entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div data-testid="view-file-list" className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-ink-950/60">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="truncate font-mono text-[11px] text-slate-400">{path}</span>
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
          {total} items
        </span>
      </div>
      {entries.length > 12 && (
        <input
          aria-label="Filter files"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="w-full border-b border-white/[0.06] bg-transparent px-3 py-1.5 text-xs outline-none placeholder:text-slate-600"
        />
      )}
      <ul className="scroll-slim max-h-64 overflow-y-auto">
        {shown.map((e) => (
          <li
            key={e.name}
            className="flex items-center gap-2.5 border-b border-white/[0.03] px-3 py-1.5 text-xs last:border-0 hover:bg-white/[0.03]"
          >
            <span className="w-4 text-center">{e.kind === "dir" ? "📁" : ICONS[e.suffix] ?? "📄"}</span>
            <span className="min-w-0 flex-1 truncate text-slate-200">{e.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-500">{fmtSize(e.size)}</span>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-3 text-center text-xs text-slate-500">no matches</li>
        )}
      </ul>
    </div>
  );
}

function FileContentView({ path, content, truncated }: { path: string; content: string; truncated?: boolean }) {
  return (
    <div data-testid="view-file-content" className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-ink-950/60">
      <div className="border-b border-white/[0.06] px-3 py-2 font-mono text-[11px] text-slate-400">{path}</div>
      <pre className="scroll-slim max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
        {content}
        {truncated && "\n… (truncated)"}
      </pre>
    </div>
  );
}

function TaskListView({ tasks, onMutate }: { tasks: GraphNode[]; onMutate?: () => void }) {
  const [local, setLocal] = useState(tasks);
  const toggle = async (t: GraphNode) => {
    const done = !t.props?.done;
    setLocal((ts) => ts.map((x) => (x.id === t.id ? { ...x, props: { ...x.props, done } } : x)));
    try {
      await updateNode(t.id, { props: { done } });
      onMutate?.();
    } catch {
      setLocal((ts) => ts.map((x) => (x.id === t.id ? { ...x, props: { ...x.props, done: !done } } : x)));
    }
  };
  const open = local.filter((t) => !t.props?.done);
  const closed = local.filter((t) => t.props?.done);
  return (
    <div data-testid="view-task-list" className="mt-2 space-y-1.5 rounded-xl border border-white/10 bg-ink-950/60 p-2.5">
      {local.length === 0 && <p className="py-2 text-center text-xs text-slate-500">No tasks yet.</p>}
      {[...open, ...closed].map((t) => {
        const done = Boolean(t.props?.done);
        return (
          <button
            key={t.id}
            onClick={() => toggle(t)}
            aria-pressed={done}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-white/[0.04]"
          >
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${
                done ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300" : "border-white/25"
              }`}
            >
              {done ? "✓" : ""}
            </span>
            <span className={done ? "text-slate-500 line-through" : "text-slate-200"}>{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ViewRendererProps {
  view: ViewSpec;
  onMutate?: () => void; // e.g. bump graph version after a task toggle
}

export default function ViewRenderer({ view, onMutate }: ViewRendererProps) {
  switch (view.type) {
    case "file_list":
      return <FileListView path={view.path} entries={view.entries} total={view.total} />;
    case "file_content":
      return <FileContentView path={view.path} content={view.content} truncated={view.truncated} />;
    case "task_list":
      return <TaskListView tasks={view.tasks} onMutate={onMutate} />;
    default:
      return null;
  }
}
