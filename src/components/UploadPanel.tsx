"use client";
import { useState } from "react";
import type { ExtractedDoc } from "@/lib/extract/schema";
import { buttonCls, Card, primaryCls, Spinner } from "./ui";

interface Props {
  docs: ExtractedDoc[];
  onDocs: (docs: ExtractedDoc[]) => void;
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

/** Step 1: upload files (→ /api/extract, the only model call) or load the sample shipment. */
export function UploadPanel({ docs, onDocs }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"extract" | "sample" | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function extract() {
    setBusy("extract");
    setErrors([]);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setErrors((body.errors ?? []).map((e: { file: string; error: string }) => `${e.file}: ${e.error}`));
      if (body.documents?.length) onDocs(body.documents);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(null);
    }
  }

  async function sample() {
    setBusy("sample");
    const body = await (await fetch("/api/sample")).json();
    onDocs(body.documents);
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
            {busy === "extract" ? <><Spinner /> Reading…</> : "Extract"}
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
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((e) => <li key={e}>⚠ {e}</li>)}
        </ul>
      )}
    </Card>
  );
}
