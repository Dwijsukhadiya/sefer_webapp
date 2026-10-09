import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { buildAuditRecord, diffJson, ENTRY_XSD, entryReference } from "../src/lib/audit";
import { BrokerInputs, emptyBrokerInputs } from "../src/lib/netchb/brokerInputs";
import { buildEntry } from "../src/lib/pipeline";

async function audit(edit?: (docs: typeof shipment001) => void, broker = emptyBrokerInputs()) {
  const reviewed = structuredClone(shipment001);
  edit?.(reviewed);
  const result = await buildEntry(reviewed, broker);
  return buildAuditRecord({
    extractedByModel: shipment001, reviewed, broker, result,
    generatedAt: "2026-10-09T12:00:00.000Z", sha256: { "entry.xml": "abc", "KBAS-NB-26-0912_Commercial_Invoice.pdf": "def" },
  });
}

describe("compliance audit trail", () => {
  it("separates what the code corrected from what still needs a person", async () => {
    const a = await audit();
    const corrected = a.correctionsApplied.map((f) => f.id);
    expect(corrected).toContain("LINE_EXTENSION_MISMATCH");
    expect(corrected).toContain("ASSIST_DETECTED");
    expect(a.openIssues.map((f) => f.id)).toContain("QUANTITY_MISMATCH");
    expect(a.openIssues.every((f) => !f.autoApplied)).toBe(true);
    expect(a.manualEdits).toEqual([]);
    expect(a.entry).toMatchObject({ reference: "BMLVHCM26090418", xsdValid: true, xmlSha256: "abc" });
    expect(a.xml.document).toBe((await buildEntry(shipment001, emptyBrokerInputs())).xml);
  });

  it("records every manual edit with the extracted and reviewed values", async () => {
    const a = await audit((d) => { d[0].lineItems[1].quantity = 1176; });
    expect(a.manualEdits).toEqual([{ path: "documents[0].lineItems[1].quantity", extracted: 1200, reviewed: 1176 }]);
  });

  it("lists each source file with its hash and the documents read from it", async () => {
    const a = await audit();
    expect(a.sources).toHaveLength(3);
    expect(a.sources[0]).toEqual({
      file: "KBAS-NB-26-0912_Commercial_Invoice.pdf", sha256: "def",
      documents: [{ docType: "commercial_invoice", documentNumber: "KBAS/NB/26-0912" }],
    });
    expect(a.sources[1].sha256).toBeNull(); // not hashed → said so, never invented
  });

  it("pins the exact schema used", () => {
    const hash = createHash("sha256").update(readFileSync("schemas/entry.original.xsd")).digest("hex");
    expect(ENTRY_XSD.sha256).toBe(hash);
  });

  it("uses the broker's entry number as the reference when given", async () => {
    const r = await buildEntry(shipment001, emptyBrokerInputs());
    expect(entryReference(r.facts, BrokerInputs.parse({ filerCode: "abc", entryNumber: "1234567" }))).toBe("ABC-1234567");
  });

  it("diffJson reports leaves, including added and removed ones", () => {
    expect(diffJson({ a: 1, b: [1, 2] }, { a: 1, b: [1, 3, 4] })).toEqual([
      { path: "b[1]", extracted: 2, reviewed: 3 },
      { path: "b[2]", extracted: null, reviewed: 4 },
    ]);
  });
});
