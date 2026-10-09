"use client";
import { useEffect, useState } from "react";
import { BrokerForm } from "@/components/BrokerForm";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { EntryLines } from "@/components/EntryLines";
import { FindingsPanel } from "@/components/FindingsPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { Spinner } from "@/components/ui";
import { XmlPanel } from "@/components/XmlPanel";
import type { ExtractedDoc } from "@/lib/extract/schema";
import { BrokerInputs } from "@/lib/netchb/brokerInputs";
import type { EntryResult } from "@/lib/pipeline";

type StepState = "done" | "attention" | "pending";

export default function Home() {
  const [docs, setDocs] = useState<ExtractedDoc[]>([]);
  const [broker, setBroker] = useState<BrokerInputs>(() => BrokerInputs.parse({}));
  const [result, setResult] = useState<EntryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  // /?sample opens straight onto the sample shipment (demos, screenshots).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("sample")) return;
    fetch("/api/sample").then((r) => r.json()).then((b) => setDocs(b.documents));
  }, []);

  // Any edit to the documents or broker inputs rebuilds the entry. No model call happens here.
  useEffect(() => {
    if (!docs.length) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBuilding(true);
      try {
        const res = await fetch("/api/entry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ documents: docs, brokerInputs: broker }),
          signal: ctrl.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        setResult(body);
        setError(null);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ctrl.signal.aborted) setBuilding(false);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [docs, broker]);

  const fileName = `${result?.facts.houseBill ?? result?.facts.invoiceNumber?.replace(/[^A-Za-z0-9-]/g, "") ?? "entry"}-netchb.xml`;

  const openRequired = result?.missing.filter((m) => m.required).length ?? 0;
  const errors = result?.findings.filter((f) => f.severity === "error" && f.category !== "filing").length ?? 0;
  const steps: Array<{ id: string; label: string; state: StepState; note?: string }> = [
    { id: "documents", label: "Documents", state: docs.length ? "done" : "pending", note: docs.length ? `${docs.length}` : undefined },
    { id: "findings", label: "Findings", state: result ? (errors ? "attention" : "done") : "pending", note: result ? `${errors} errors` : undefined },
    { id: "broker", label: "Broker", state: result ? (openRequired ? "attention" : "done") : "pending", note: result ? (openRequired ? `${openRequired} open` : "complete") : undefined },
    { id: "xml", label: "XML", state: result ? (result.xsd.valid ? "done" : "attention") : "pending", note: result ? (result.xsd.valid ? "valid" : "invalid") : undefined },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-[var(--navy-900)] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-900/40">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v10l9 4 9-4V7" />
                <path d="M12 11v10" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Sefer Entry Prep</h1>
              <p className="text-xs text-slate-400">Shipment documents in · NetCHB Type 01 entry out · every discrepancy shown</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {building && <span className="flex items-center gap-1.5 text-blue-300"><Spinner className="h-3.5 w-3.5" /> Rebuilding entry…</span>}
            <span className="hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 sm:inline">Stages only · never transmits to CBP</span>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur" aria-label="Progress">
        <ol className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2">
          {steps.map((s, i) => (
            <li key={s.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className={`mx-1 h-px w-6 sm:w-10 ${s.state === "pending" ? "bg-slate-200" : "bg-blue-300"}`} />}
              <a href={`#${s.id}`} className="flex items-center gap-2 rounded-full px-2.5 py-1 text-xs transition hover:bg-slate-100">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    s.state === "done" ? "bg-emerald-600 text-white" : s.state === "attention" ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {s.state === "done" ? "✓" : s.state === "attention" ? "!" : i + 1}
                </span>
                <span className={`font-medium ${s.state === "pending" ? "text-slate-400" : "text-slate-800"}`}>{s.label}</span>
                {s.note && <span className="hidden text-slate-400 sm:inline">{s.note}</span>}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        <div id="documents" className="scroll-mt-16">
          <UploadPanel docs={docs} onDocs={(d) => { setDocs(d); setResult(null); }} />
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {result && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div id="findings" className="min-w-0 scroll-mt-16 space-y-4 lg:col-span-2">
              <FindingsPanel findings={result.findings} />
            </div>
            <div className="min-w-0 space-y-4 lg:col-span-3">
              <div id="broker" className="scroll-mt-16">
                <BrokerForm value={broker} onChange={setBroker} facts={result.facts} missing={result.missing} />
              </div>
              <EntryLines facts={result.facts} broker={broker} onBroker={setBroker} />
              <div id="xml" className="scroll-mt-16">
                <XmlPanel xml={result.xml} xsd={result.xsd} fileName={fileName} />
              </div>
              <DocumentsPanel docs={docs} onChange={setDocs} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
