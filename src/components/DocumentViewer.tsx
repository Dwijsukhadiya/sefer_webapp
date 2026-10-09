"use client";
import type { ExtractedDoc } from "@/lib/extract/schema";

/** A source file the browser can display: a blob URL for uploads, a route URL for the sample. */
export interface SourceFile {
  name: string;
  url: string;
  mediaType: string;
}

/** The sample shipment's PDFs, served by /api/sample/files/[name]. */
export const sampleSources = (docs: ExtractedDoc[]): SourceFile[] =>
  [...new Set(docs.map((d) => d.sourceFile))].map((name) => ({
    name,
    url: `/api/sample/files/${encodeURIComponent(name)}`,
    mediaType: name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png",
  }));

const LABEL: Record<string, string> = { commercial_invoice: "📄 Invoice", packing_list: "📦 Packing list", bill_of_lading: "🚢 B/L", air_waybill: "✈️ AWB" };

interface Props {
  sources: SourceFile[];
  docs: ExtractedDoc[];
  active: string | null;
  onSelect: (name: string) => void;
}

/** The original document beside the data, so every extracted value can be checked by eye. */
export function DocumentViewer({ sources, docs, active, onSelect }: Props) {
  const current = sources.find((s) => s.name === active) ?? sources[0];
  // Several documents can share one file (a combined PDF): label it by all of them.
  const labelFor = (name: string) => [...new Set(docs.filter((d) => d.sourceFile === name).map((d) => LABEL[d.docType] ?? "📎 Document"))].join(" + ") || `📎 ${name}`;

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="mr-1 shrink-0 text-[13px] font-semibold tracking-tight text-slate-900">Source documents</h2>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist">
          {sources.map((s) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={s.name === current?.name}
              onClick={() => onSelect(s.name)}
              title={s.name}
              className={`flex max-w-56 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
                s.name === current?.name ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="truncate">{labelFor(s.name)}</span>
            </button>
          ))}
        </div>
        {current && (
          <a href={current.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
            Open ↗
          </a>
        )}
      </header>
      <div className="relative min-h-0 flex-1 bg-slate-100">
        {!current ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
            Upload documents to see them here, side by side with what was extracted.
          </div>
        ) : current.mediaType === "application/pdf" ? (
          <iframe key={current.url} src={`${current.url}#view=FitH`} title={current.name} className="h-full w-full border-0" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- blob URLs of uploaded scans
          <img src={current.url} alt={current.name} className="mx-auto h-full object-contain" />
        )}
      </div>
    </section>
  );
}
