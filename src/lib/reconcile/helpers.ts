import type { ExtractedDoc } from "../extract/schema";
import { normKey } from "./facts";
import type { EntryLine, Evidence } from "./types";

export const ev = (doc: ExtractedDoc, text: string): Evidence => ({ source: doc.docType, file: doc.sourceFile, text });

/** Every free-text note across the documents, tagged with its document. */
export const allNotes = (docs: ExtractedDoc[]) =>
  docs.flatMap((d) => [...d.notes.map((text) => ({ doc: d, text })), ...d.lineItems.flatMap((li) => li.lineNotes.map((text) => ({ doc: d, text })))]);

/**
 * Which entry lines does a piece of text refer to? Matches style/SKU codes
 * ("W-B220"), and "item 5" / "line 5" / "no. 5" references.
 */
export function linesReferencedBy(text: string, lines: EntryLine[]): EntryLine[] {
  const t = normKey(text);
  const bySku = lines.filter((l) => l.sku && normKey(l.sku).length >= 3 && t.includes(normKey(l.sku)));
  if (bySku.length) return bySku;
  const nums = [...text.matchAll(/\b(?:item|line|no\.?|#)\s*(\d{1,3})\b/gi)].map((m) => m[1]);
  return lines.filter((l) => l.lineNo && nums.includes(l.lineNo));
}

/** Pull money amounts out of free text, e.g. "value USD 4,180.00". */
export function moneyIn(text: string): number[] {
  return [...text.matchAll(/(?:USD|US\$|\$|EUR|€|GBP|£|CNY|RMB|VND|HKD|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi)].map((m) =>
    parseFloat(m[1].replace(/,/g, "")),
  );
}

export const lineLabel = (l: EntryLine) => `Line ${l.lineNo ?? "?"}${l.sku ? ` (${l.sku})` : ""}`;
