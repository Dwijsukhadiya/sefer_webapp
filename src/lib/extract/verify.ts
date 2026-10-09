/**
 * Compares the main transcription with an independent second read of the identifiers.
 * Pure: it never picks a value. A disagreement is added to the document's "uncertain" list
 * with both readings, and the EXTRACTION_UNCERTAIN rule turns it into an error finding.
 */
import type { ExtractedDoc, IdentifierRead } from "./schema";

export const READS_DISAGREE = "Two independent reads disagree";
export const SECOND_READ_FAILED = "The second read of identifiers could not run";

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hasIdentifiers = (d: ExtractedDoc) => !!(d.houseBill || d.masterBill || d.containers.some((c) => c.number));

/** Pair each main document with the second-read document of the same type, in order. */
function pair(docs: ExtractedDoc[], second: IdentifierRead["documents"]) {
  const used = new Set<number>();
  return docs.map((d, i) => {
    const j = second[i]?.docType === d.docType && !used.has(i) ? i : second.findIndex((s, k) => s.docType === d.docType && !used.has(k));
    if (j >= 0) used.add(j);
    return j >= 0 ? second[j] : null;
  });
}

export function compareIdentifiers(docs: ExtractedDoc[], second: IdentifierRead | null): ExtractedDoc[] {
  if (!second) {
    // Say so only where it matters: documents that carry bill or container numbers.
    return docs.map((d) => (hasIdentifiers(d)
      ? { ...d, uncertain: [...d.uncertain, { field: "bill and container numbers", reason: `${SECOND_READ_FAILED}; check them against the document.` }] }
      : d));
  }
  const pairs = pair(docs, second.documents);
  return docs.map((d, i) => {
    const s = pairs[i];
    if (!s) return d;
    const extra: ExtractedDoc["uncertain"] = [];
    const check = (field: string, a: string | null, b: string | null) => {
      if (a && b && norm(a) !== norm(b)) extra.push({ field, reason: `${READS_DISAGREE}: "${a}" vs "${b}". Check against the document.` });
    };
    check("documentNumber", d.documentNumber, s.documentNumber);
    check("houseBill", d.houseBill, s.houseBill);
    check("masterBill", d.masterBill, s.masterBill);
    const mine = d.containers.map((c) => norm(c.number)).filter(Boolean).sort().join(", ");
    const theirs = s.containerNumbers.map(norm).filter(Boolean).sort().join(", ");
    if (mine && theirs && mine !== theirs) extra.push({ field: "containers", reason: `${READS_DISAGREE}: "${mine}" vs "${theirs}". Check against the document.` });
    return extra.length ? { ...d, uncertain: [...d.uncertain, ...extra] } : d;
  });
}
