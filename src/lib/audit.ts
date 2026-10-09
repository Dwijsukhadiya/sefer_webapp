/**
 * The audit trail for one entry: what the model read, what a person changed, what the
 * rules concluded and why, and the exact XML produced. Pure, so it is testable and the
 * same inputs always give the same record (apart from the timestamp you pass in).
 */
import type { ExtractedDoc } from "./extract/schema";
import type { BrokerInputs, MissingField } from "./netchb/brokerInputs";
import type { EntryResult } from "./pipeline";
import type { Finding, ShipmentFacts } from "./reconcile/types";

export const ENTRY_XSD = {
  source: "https://www.netchb.com/xml/entry/entry.xsd",
  sha256: "1bef18d4121f83f7f09a7346fa9d4a1a37310730363b66e6724908a3e5dc7132", // schemas/entry.original.xsd
};

export interface ManualEdit {
  path: string; // e.g. "documents[0].lineItems[1].quantity"
  extracted: unknown;
  reviewed: unknown;
}

export interface AuditRecord {
  format: "sefer-entry-prep/audit-trail@1";
  generatedAt: string;
  recordkeeping: string;
  entry: { reference: string; entryType: string; importer: string | null; xsdValid: boolean; xmlSha256: string | null };
  sources: Array<{ file: string; sha256: string | null; documents: Array<{ docType: string; documentNumber: string | null }> }>;
  extractedByModel: ExtractedDoc[];
  manualEdits: ManualEdit[];
  brokerInputs: BrokerInputs;
  facts: ShipmentFacts;
  correctionsApplied: Finding[]; // values the rules changed, each with before/after and evidence
  openIssues: Finding[]; // errors and warnings still needing a person
  findings: Finding[]; // everything, including info and XML notes
  missing: MissingField[];
  xml: { schema: typeof ENTRY_XSD; valid: boolean; errors: string[]; document: string };
}

/** Every leaf that differs between two JSON values, with its path. Arrays compare by index. */
export function diffJson(a: unknown, b: unknown, path = ""): ManualEdit[] {
  if (Object.is(a, b)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => diffJson(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : k));
  }
  return [{ path, extracted: a ?? null, reviewed: b ?? null }];
}

/** A file-name-safe reference for the entry: the entry number if the broker gave one. */
export function entryReference(facts: ShipmentFacts, broker: BrokerInputs): string {
  if (broker.filerCode && broker.entryNumber) return `${broker.filerCode}-${broker.entryNumber}`.toUpperCase();
  return (facts.houseBill ?? facts.masterBill ?? facts.invoiceNumber ?? "draft").replace(/[^A-Za-z0-9-]/g, "");
}

export interface AuditInput {
  extractedByModel: ExtractedDoc[];
  reviewed: ExtractedDoc[];
  broker: BrokerInputs;
  result: EntryResult;
  generatedAt: string;
  sha256: Record<string, string>; // file name (or "entry.xml") → hex digest
}

export function buildAuditRecord({ extractedByModel, reviewed, broker, result, generatedAt, sha256 }: AuditInput): AuditRecord {
  const files = [...new Set(extractedByModel.map((d) => d.sourceFile))];
  const notFiling = (f: Finding) => f.category !== "filing";
  return {
    format: "sefer-entry-prep/audit-trail@1",
    generatedAt,
    recordkeeping:
      "Supporting record for 19 CFR Part 163. Entry records must be kept for 5 years from the date of entry (19 CFR 163.4). Keep it with the commercial documents it was built from.",
    entry: {
      reference: entryReference(result.facts, broker),
      entryType: result.facts.entryType,
      importer: result.facts.importer?.name ?? null,
      xsdValid: result.xsd.valid,
      xmlSha256: sha256["entry.xml"] ?? null,
    },
    sources: files.map((file) => ({
      file,
      sha256: sha256[file] ?? null,
      documents: extractedByModel.filter((d) => d.sourceFile === file).map((d) => ({ docType: d.docType, documentNumber: d.documentNumber })),
    })),
    extractedByModel,
    manualEdits: diffJson({ documents: extractedByModel }, { documents: reviewed }),
    brokerInputs: broker,
    facts: result.facts,
    correctionsApplied: result.findings.filter((f) => f.autoApplied && notFiling(f)),
    openIssues: result.findings.filter((f) => !f.autoApplied && f.severity !== "info" && notFiling(f)),
    findings: result.findings,
    missing: result.missing,
    xml: { schema: ENTRY_XSD, valid: result.xsd.valid, errors: result.xsd.errors, document: result.xml },
  };
}
