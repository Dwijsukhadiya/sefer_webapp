"use client";
import { useState } from "react";
import type { Finding, Severity } from "@/lib/reconcile/types";
import { Badge, Card, SEVERITY_TONE } from "./ui";

const LABEL: Record<string, string> = {
  commercial_invoice: "Invoice", packing_list: "Packing list", bill_of_lading: "B/L", air_waybill: "AWB",
  broker_input: "Broker", derived: "Derived", other: "Other",
};

type Filter = Severity | "filing";
const FILTERS: Array<{ key: Filter; label: string; dot: string }> = [
  { key: "error", label: "Errors", dot: "dot-error" },
  { key: "warning", label: "Warnings", dot: "dot-warning" },
  { key: "info", label: "Info", dot: "dot-info" },
  { key: "filing", label: "XML notes", dot: "dot-xml" },
];

const kind = (f: Finding): Filter => (f.category === "filing" ? "filing" : f.severity);

/** Every discrepancy, correction and judgment call, with the evidence behind it. */
export function FindingsPanel({ findings }: { findings: Finding[] }) {
  const [show, setShow] = useState<Record<Filter, boolean>>({ error: true, warning: true, info: true, filing: false });
  const count = (k: Filter) => findings.filter((f) => kind(f) === k).length;
  const visible = findings.filter((f) => show[kind(f)]);
  const applied = findings.filter((f) => f.autoApplied && f.category !== "filing").length;

  return (
    <Card title="Findings" step={2} aside={<span className="text-xs text-slate-500">{applied} auto-applied</span>}>
      <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-lg bg-slate-50 p-1.5 ring-1 ring-slate-200/70">
        {FILTERS.map(({ key, label, dot }) => (
          <button
            key={key}
            onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
            aria-pressed={show[key]}
            className={`flex flex-col items-start rounded-md px-2.5 py-1.5 text-left transition ${show[key] ? "bg-white shadow-sm ring-1 ring-slate-200" : "opacity-50 hover:opacity-80"}`}
          >
            <span className="text-lg font-semibold leading-tight text-slate-900">{count(key)}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className={`dot ${dot}`} />{label}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {visible.map((f, i) => <FindingRow key={`${f.id}-${f.field}-${i}`} f={f} />)}
        {!visible.length && <li className="py-6 text-center text-sm text-slate-400">Nothing to show with these filters.</li>}
      </ul>
    </Card>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const k = kind(f);
  return (
    <li>
      <details className={`finding finding-${k === "filing" ? "xml" : k}`}>
        <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5">
          <svg className="chevron mt-1 h-3 w-3 shrink-0 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m4 2 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1 text-[13px] leading-snug text-slate-800">{f.title}</span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={k === "filing" ? "violet" : SEVERITY_TONE[f.severity]}>{k === "filing" ? "xml" : f.severity}</Badge>
            {f.autoApplied && <Badge tone="green">auto-applied</Badge>}
          </span>
        </summary>
        <div className="finding-body space-y-2.5 px-3 pb-3 pl-8 text-sm">
          <p className="leading-relaxed text-slate-600">{f.detail}</p>
          {f.evidence.length > 0 && (
            <ul className="space-y-1 rounded-md bg-slate-50 p-2 ring-1 ring-slate-200/70">
              {f.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="shrink-0"><Badge>{LABEL[e.source] ?? e.source}</Badge></span>
                  <q className="font-mono text-[11px] text-slate-700">{e.text}</q>
                </li>
              ))}
            </ul>
          )}
          <p className="text-slate-800">
            <span className="font-semibold">{f.autoApplied ? "What we did: " : "Action: "}</span>
            {f.resolution}
          </p>
          <p className="font-mono text-[10px] text-slate-400">{f.id} · {f.field}</p>
        </div>
      </details>
    </li>
  );
}
