"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { XsdIssue } from "@/lib/netchb/explainXsd";
import type { XsdResult } from "@/lib/netchb/validate";
import { buttonCls, Card } from "./ui";

const TOKEN = /(<\?[^?]*\?>)|(<\/?)([\w:.-]+)|([\w:.-]+)(=)("[^"]*")|(\/?>)/g;

/** Tiny XML highlighter: returns React nodes (no innerHTML), one call per line. */
function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let inTag = false;
  let k = 0;
  const push = (cls: string, text: string) => out.push(<span key={k++} className={cls}>{text}</span>);
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) push("xml-text", line.slice(last, m.index));
    if (m[1]) push("xml-decl", m[1]);
    else if (m[2]) { push("xml-punct", m[2]); push("xml-tag", m[3]); inTag = true; }
    else if (m[4] && inTag) { push("xml-attr", m[4]); push("xml-punct", m[5]); push("xml-value", m[6]); }
    else if (m[7] && inTag) { push("xml-punct", m[7]); inTag = false; }
    else push("xml-text", m[0]);
    last = m.index + m[0].length;
  }
  if (last < line.length) push("xml-text", line.slice(last));
  return out;
}

/** The NetCHB entry document, its XSD validation result, copy and download. */
export function XmlPanel({ xml, xsd, issues, fileName }: { xml: string; xsd: XsdResult; issues: XsdIssue[]; fileName: string }) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => xml.split("\n"), [xml]);

  async function copy() {
    await navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card
      title="NetCHB entry XML"
      step={5}
      aside={
        <div className="flex items-center gap-2">
          <button className={buttonCls} onClick={copy}>
            {copied ? (
              <>
                <svg className="check-pop h-4 w-4 text-emerald-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : "Copy"}
          </button>
          <button className={buttonCls} onClick={download}>Download</button>
        </div>
      }
    >
      <div className={`mb-3 flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ${xsd.valid ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${xsd.valid ? "bg-emerald-600" : "bg-red-600"}`}>
          {xsd.valid ? "✓" : "✗"}
        </span>
        <div className="text-sm">
          <div className={`font-semibold ${xsd.valid ? "text-emerald-800" : "text-red-800"}`}>
            {xsd.valid ? "Valid against NetCHB entry.xsd" : `${xsd.errors.length} XSD error${xsd.errors.length === 1 ? "" : "s"}`}
          </div>
          <div className="text-xs text-slate-600">
            No <code className="font-mono">&lt;transmit/&gt;</code> tag: uploading stages the entry in NetCHB for broker review. Nothing is sent to CBP.
          </div>
        </div>
      </div>

      {!xsd.valid && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-red-800">What to fix before this can be uploaded to NetCHB:</p>
          <ul className="list-disc space-y-1 pl-4 text-sm text-red-800">
            {issues.map((i, n) => <li key={n}>{i.message}</li>)}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-red-600">Validator output</summary>
            <ul className="mt-1 space-y-1 font-mono text-[10px] text-red-700">{xsd.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </details>
        </div>
      )}

      <div className="xml-view max-h-[34rem] overflow-auto py-3 pr-4">
        <code className="block min-w-max">
          {lines.map((line, i) => (
            <div key={i} className="xml-line">
              <span className="xml-ln">{i + 1}</span>
              <span className="xml-code">{highlight(line)}</span>
            </div>
          ))}
        </code>
      </div>
    </Card>
  );
}
