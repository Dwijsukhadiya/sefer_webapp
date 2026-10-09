"use client";
import type { ExtractedDoc, LineItem } from "@/lib/extract/schema";
import { Badge, Card, inputCls } from "./ui";

interface Props {
  docs: ExtractedDoc[];
  onChange: (docs: ExtractedDoc[]) => void;
}

const DOC_LABEL: Record<string, string> = {
  commercial_invoice: "Commercial invoice", packing_list: "Packing list", bill_of_lading: "Bill of lading", air_waybill: "Air waybill", other: "Other document",
};

type NumKey = "quantity" | "unitPrice" | "amount";

/**
 * What the model read, exactly as printed. Fix a misread here and everything downstream
 * (findings, values, XML) is recomputed without calling the model again.
 */
export function DocumentsPanel({ docs, onChange }: Props) {
  const patchLine = (d: number, i: number, k: NumKey | "hsCode", raw: string) => {
    const next = structuredClone(docs);
    const line: LineItem = next[d].lineItems[i];
    if (k === "hsCode") line.hsCode = raw || null;
    else line[k] = raw === "" ? null : Number(raw);
    onChange(next);
  };

  return (
    <Card title="Extracted documents (as printed, editable)">
      <div className="space-y-3">
        {docs.map((doc, d) => (
          <details key={`${doc.sourceFile}-${d}`} className="finding finding-doc">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <svg className="chevron h-3 w-3 shrink-0 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m4 2 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold text-slate-800">{DOC_LABEL[doc.docType]}</span>
              <span className="font-mono text-xs text-slate-500">{doc.documentNumber ?? "no number"}</span>
              <span className="text-xs text-slate-400">· {doc.sourceFile}</span>
              {doc.uncertain.length > 0 && <Badge tone="amber">{doc.uncertain.length} uncertain</Badge>}
              {doc.amendments.length > 0 && <Badge tone="red">{doc.amendments.length} amended</Badge>}
            </summary>
            <div className="finding-body space-y-3 border-t border-slate-100 px-3 py-3 text-xs">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {([
                  ["Date", doc.documentDateRaw], ["Currency", doc.currency], ["Terms", [doc.incoterm, doc.incotermPlace].filter(Boolean).join(" ")],
                  ["Origin", doc.statedCountryOfOrigin], ["House B/L", doc.houseBill], ["Master B/L", doc.masterBill],
                  ["Vessel / voyage", [doc.vessel, doc.voyage].filter(Boolean).join(" / ")], ["Loading", doc.portOfLoading], ["Discharge", doc.portOfDischarge],
                ] as const).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-mono text-slate-800">{v}</dd></div>
                ))}
              </dl>

              {doc.parties.length > 0 && (
                <ul className="space-y-0.5">
                  {doc.parties.map((p, i) => (
                    <li key={i}><Badge>{p.role}</Badge> <span className="text-slate-800">{p.name}</span>{" "}
                      <span className="text-slate-500">{[...p.addressLines, p.city, p.country].filter(Boolean).join(", ")}</span>
                      {p.qualifier && <span className="text-slate-500 italic"> — {p.qualifier}</span>}
                    </li>
                  ))}
                </ul>
              )}

              {doc.lineItems.length > 0 && (
                <table className="w-full">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-1 pr-2">Style</th><th className="pr-2">HS</th><th className="pr-2">Qty</th><th className="pr-2">Unit price</th><th className="pr-2">Amount</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {doc.lineItems.map((li, i) => (
                      <tr key={i} className="border-t border-slate-100 align-top">
                        <td className="py-1 pr-2 font-medium">{li.styleOrSku ?? li.lineNo}</td>
                        <td className="pr-2"><input className={`${inputCls} w-20 text-xs`} value={li.hsCode ?? ""} onChange={(e) => patchLine(d, i, "hsCode", e.target.value)} /></td>
                        {(["quantity", "unitPrice", "amount"] as const).map((k) => (
                          <td key={k} className="pr-2">
                            <input type="number" className={`${inputCls} w-24 text-right text-xs`} value={li[k] ?? ""} onChange={(e) => patchLine(d, i, k, e.target.value)} />
                          </td>
                        ))}
                        <td className="text-slate-500">{li.lineNotes.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {doc.amendments.map((a, i) => (
                <p key={i} className="text-red-700">Amended {a.field}: <s>{a.original}</s> → {a.replacement ?? "(none)"} ({a.kind.replace(/_/g, " ")})</p>
              ))}
              {doc.uncertain.map((u, i) => (
                <p key={i} className="text-amber-700">Uncertain: {u.field}, {u.reason}</p>
              ))}
              {doc.notes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-slate-600">{doc.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              )}
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}
