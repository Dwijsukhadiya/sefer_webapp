"use client";
import { useMemo, useState } from "react";
import { buildAuditRecord, diffJson, entryReference } from "@/lib/audit";
import type { ExtractedDoc } from "@/lib/extract/schema";
import type { BrokerInputs } from "@/lib/netchb/brokerInputs";
import type { EntryResult } from "@/lib/pipeline";
import type { SourceFile } from "./DocumentViewer";
import { Card, primaryCls, Spinner } from "./ui";

interface Props {
  extractedByModel: ExtractedDoc[];
  reviewed: ExtractedDoc[];
  broker: BrokerInputs;
  result: EntryResult;
  sources: SourceFile[];
}

async function sha256(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Download the reconciliation trail: model output, human edits, rule decisions, final XML. */
export function AuditPanel({ extractedByModel, reviewed, broker, result, sources }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edits = useMemo(() => diffJson({ documents: extractedByModel }, { documents: reviewed }).length, [extractedByModel, reviewed]);
  const corrections = result.findings.filter((f) => f.autoApplied && f.category !== "filing").length;
  const open = result.findings.filter((f) => !f.autoApplied && f.severity !== "info" && f.category !== "filing").length;

  async function exportAudit() {
    setBusy(true);
    setError(null);
    try {
      const hashes: Record<string, string> = { "entry.xml": await sha256(result.xml) };
      for (const s of sources) {
        try {
          hashes[s.name] = await sha256(await (await fetch(s.url)).arrayBuffer());
        } catch {
          // A file we can no longer read is recorded with sha256: null, never a guessed value.
        }
      }
      const record = buildAuditRecord({ extractedByModel, reviewed, broker, result, generatedAt: new Date().toISOString(), sha256: hashes });
      const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `audit-trail-${record.entry.reference}.json` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Compliance audit trail" step={6}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
          {[
            ["Corrections applied", corrections, "text-emerald-700"],
            ["Open issues", open, open ? "text-amber-700" : "text-slate-900"],
            ["Manual edits", edits, "text-slate-900"],
          ].map(([k, v, tone]) => (
            <div key={k as string} className="rounded-lg bg-slate-50 px-2 py-2 ring-1 ring-slate-200/70">
              <dd className={`text-lg font-semibold ${tone}`}>{v}</dd>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
            </div>
          ))}
        </dl>
        <button className={primaryCls} onClick={exportAudit} disabled={busy}>
          {busy ? <><Spinner /> Preparing…</> : "Export compliance audit"}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        19 CFR Part 163 recordkeeping: export the automated reconciliation trail for your records (keep 5 years from the date of entry).
        The file holds what the model read, every manual edit, each rule decision with its evidence, the broker inputs, the final XML, and
        SHA-256 hashes of the source files. <span className="font-mono">audit-trail-{entryReference(result.facts, broker)}.json</span>
      </p>
      {error && <p className="mt-2 text-xs text-red-700">⚠ {error}</p>}
    </Card>
  );
}
