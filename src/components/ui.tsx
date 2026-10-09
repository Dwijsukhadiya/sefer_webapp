import type { ReactNode } from "react";

export function Card({ title, step, aside, children }: { title: string; step?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight text-slate-900">
          {step !== undefined && <span className="step-num">{step}</span>}
          {title}
        </h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export type Tone = "red" | "amber" | "blue" | "green" | "slate" | "violet";

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const SEVERITY_TONE: Record<string, Tone> = { error: "red", warning: "amber", info: "blue" };

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

export const buttonCls =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-px hover:bg-slate-50 hover:shadow disabled:pointer-events-none disabled:opacity-50";

export const primaryCls =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-blue-500 hover:shadow-md disabled:pointer-events-none disabled:opacity-50";
