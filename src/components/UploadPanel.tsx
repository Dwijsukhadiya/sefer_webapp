"use client";
import { useState } from "react";
import type { ExtractedDoc } from "@/lib/extract/schema";
import { sampleSources, type SourceFile } from "./DocumentViewer";
import { buttonCls, Card, primaryCls, Spinner } from "./ui";

interface Props {
  docs: ExtractedDoc[];
  onDocs: (docs: ExtractedDoc[], sources: SourceFile[]) => void;
}

const DOC_CHIP: Record<string, { icon: string; label: string }> = {
  commercial_invoice: { icon: "📄", label: "Invoice" },
  packing_list: { icon: "📦", label: "Packing list" },
  bill_of_lading: { icon: "🚢", label: "Bill of lading" },
  air_waybill: { icon: "✈️", label: "Air waybill" },
  other: { icon: "📎", label: "Other" },
};

function UploadIcon() {
  return (
    <svg className="h-9 w-9 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5" />
      <path d="M12 12v8" />
      <path d="m8.5 15.5 3.5-3.5 3.5 3.5" />
    </svg>
  );
}

/** Vercel refuses request bodies over ~4.5 MB before the app sees them, so check first. */
const MAX_FILE_BYTES = 4_400_000;
const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;

interface ExtractResponse {
  documents: ExtractedDoc[];
  errors: Array<{ file: string; error: string }>;
}

class NeedsCodeError extends Error {}

/** Step 1: upload files (→ /api/extract, the only model call) or load the sample shipment. */
export function UploadPanel({ docs, onDocs }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"extract" | "sample" | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  /** One request per file: each stays under the size limit and gets its own time budget. */
  async function extractOne(f: File): Promise<ExtractResponse> {
    const form = new FormData();
    form.append("files", f);
    const res = await fetch("/api/extract", { method: "POST", body: form, headers: code ? { "x-access-code": code } : {} });
    const text = await res.text();
    let body: (Partial<ExtractResponse> & { error?: string }) | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null; // e.g. the platform's own plain-text 413 or 504 page
    }
    if (res.status === 401) throw new NeedsCodeError(body?.error ?? "An access code is required.");
    if (!res.ok || !body) {
      const why = res.status === 413 ? `the server refused it as too large (limit ${mb(MAX_FILE_BYTES)})`
        : res.status === 504 ? "reading it took longer than the server allows; try again, or upload a smaller scan"
        : body?.error ?? `server error ${res.status}`;
      throw new Error(why);
    }
    return { documents: body.documents ?? [], errors: body.errors ?? [] };
  }

  async function extract() {
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const problems = tooBig.map((f) => `${f.name}: ${mb(f.size)} is over the ${mb(MAX_FILE_BYTES)} per-file limit of the hosted version. Compress the scan or split it into pages.`);
    setErrors(problems);
    if (!ok.length) return;

    setBusy("extract");
    setProgress({ done: 0, total: ok.length });
    const settled = await Promise.allSettled(
      ok.map((f) => extractOne(f).finally(() => setProgress((p) => ({ ...p, done: p.done + 1 })))),
    );
    const documents: ExtractedDoc[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        documents.push(...r.value.documents);
        problems.push(...r.value.errors.map((e) => `${e.file}: ${e.error}`));
      } else if (r.reason instanceof NeedsCodeError) {
        setNeedsCode(true);
        if (!problems.some((p) => p.startsWith("🔒"))) problems.push(`🔒 ${r.reason.message}`);
      } else {
        problems.push(`${ok[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    });
    setErrors(problems);
    if (documents.length) {
      const sources = ok.map((f) => ({ name: f.name, url: URL.createObjectURL(f), mediaType: f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png") }));
      onDocs(documents, sources);
    }
    setBusy(null);
  }

  async function sample() {
    setBusy("sample");
    const body = await (await fetch("/api/sample")).json();
    onDocs(body.documents, sampleSources(body.documents));
    setBusy(null);
  }

  return (
    <Card title="Shipment documents" step={1}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <label className="dropzone flex min-h-28 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 px-4 py-5 text-center">
          <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          <UploadIcon />
          {files.length ? (
            <span className="text-sm font-medium text-slate-700">{files.map((f) => f.name).join(" · ")}</span>
          ) : (
            <>
              <span className="text-sm font-semibold text-slate-700">Drop or choose shipment documents</span>
              <span className="text-xs text-slate-500">Commercial invoice, packing list, bill of lading or air waybill. PDF or images, any number.</span>
            </>
          )}
        </label>
        <div className="flex gap-2 sm:w-48 sm:flex-col">
          <button className={`${primaryCls} flex-1`} disabled={!files.length || !!busy} onClick={extract}>
            {busy === "extract" ? <><Spinner /> {progress.total > 1 ? `Reading ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} of ${progress.total}…` : "Reading…"}</> : "Extract"}
          </button>
          <button className={`${buttonCls} flex-1`} disabled={!!busy} onClick={sample} title="Hand-transcribed extraction of the three sample PDFs; no API key needed">
            {busy === "sample" ? <><Spinner /> Loading…</> : "Use sample shipment"}
          </button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detected</span>
          {docs.map((d, i) => {
            const chip = DOC_CHIP[d.docType] ?? DOC_CHIP.other;
            return (
              <span key={`${d.sourceFile}-${i}`} title={d.sourceFile} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                <span aria-hidden>{chip.icon}</span>
                <span className="font-medium">{chip.label}</span>
                {d.documentNumber && <span className="font-mono text-[10px] text-slate-400">{d.documentNumber}</span>}
              </span>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        The model only transcribes what each page says. Every check, correction and value below is computed in code and traced to its evidence.
      </p>
      {needsCode && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <label htmlFor="access-code" className="text-xs font-medium text-slate-600">Access code</label>
          <input
            id="access-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && code && files.length) extract(); }}
            className="w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-[11px] text-slate-500">Reading documents uses a paid model, so it is protected. &quot;Use sample shipment&quot; needs no code.</span>
        </div>
      )}
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((e) => <li key={e}>⚠ {e}</li>)}
        </ul>
      )}
    </Card>
  );
}
