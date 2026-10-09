import { describe, expect, it } from "vitest";
import { billOfLading, invoice } from "../fixtures/shipment-001/extraction";
import { ExtractionError, extractFile } from "../src/lib/extract/client";
import type { ExtractionProvider } from "../src/lib/extract/providers/types";
import { reconcile } from "../src/lib/reconcile";

const file = { name: "doc.pdf", mediaType: "application/pdf", base64: "" };
const strip = <T extends { sourceFile: string }>({ sourceFile: _s, ...doc }: T) => doc;
const inv = strip(invoice);
const bl = strip(billOfLading);
const agreeingIds = (docs: Array<typeof bl>) => ({
  documents: docs.map((d) => ({ docType: d.docType, documentNumber: d.documentNumber, houseBill: d.houseBill, masterBill: d.masterBill, containerNumbers: d.containers.map((c) => c.number) })),
});

/**
 * A scripted stand-in for the model. Full transcriptions come from `answers` in turn (and the
 * feedback each call received is recorded); the identifier read returns `ids` (or throws).
 */
function fake(answers: unknown[], ids: unknown | (() => never) = null): ExtractionProvider & { feedback: (string | null)[] } {
  const feedback: (string | null)[] = [];
  return {
    name: "fake",
    feedback,
    async transcribe(_f, task, fb) {
      if (task.name === "record_identifiers") return { output: typeof ids === "function" ? (ids as () => never)() : ids, truncated: false };
      feedback.push(fb);
      return { output: answers.shift() ?? null, truncated: false };
    },
  };
}

describe("extraction loop (no network)", () => {
  it("makes no second read when no verifier model is configured", async () => {
    let calls = 0;
    const p: ExtractionProvider = { name: "fake", async transcribe(_f, task) { calls++; return { output: task.name === "record_documents" ? { documents: [bl] } : null, truncated: false }; } };
    await extractFile(file, p, null);
    expect(calls).toBe(1);
  });

  it("accepts schema-valid output and tags the source file", async () => {
    const docs = await extractFile(file, fake([{ documents: [inv] }], agreeingIds([])));
    expect(docs).toHaveLength(1);
    expect(docs[0].sourceFile).toBe("doc.pdf");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const p = fake([{ documents: [{ ...inv, lineItems: "oops" }] }, { documents: [inv] }]);
    await extractFile(file, p);
    expect(p.feedback[0]).toBeNull();
    expect(p.feedback[1]).toMatch(/lineItems/);
  });

  it("gives up after a second bad answer instead of guessing", async () => {
    await expect(extractFile(file, fake([null, null]))).rejects.toBeInstanceOf(ExtractionError);
  });

  it("rejects unsupported file types before calling the model", async () => {
    const p = fake([]);
    await expect(extractFile({ ...file, mediaType: "application/zip" }, p)).rejects.toThrow(/Unsupported/);
    expect(p.feedback).toHaveLength(0);
  });
});

/** The same fake as main reader and verifier (the code only cares that a verifier exists). */
const twice = (p: ExtractionProvider) => [p, p] as const;

describe("second read of identifiers (when VERIFY_MODEL is set)", () => {
  it("adds nothing when both reads agree", async () => {
    const [d] = await extractFile(file, ...twice(fake([{ documents: [bl] }], agreeingIds([bl]))));
    expect(d.uncertain).toEqual([]);
  });

  it("records both values when the master bill reads differ (the live combined-PDF misread)", async () => {
    const second = agreeingIds([bl]);
    second.documents[0].masterBill = "OPLUSGN26091775"; // two digits dropped
    const [d] = await extractFile(file, ...twice(fake([{ documents: [bl] }], second)));
    expect(d.uncertain).toEqual([{ field: "masterBill", reason: expect.stringMatching(/"OPLUSGN260917735" vs "OPLUSGN26091775"/) }]);
    expect(d.masterBill).toBe("OPLUSGN260917735"); // never silently replaced
  });

  it("flags container disagreements and ignores spacing differences", async () => {
    const spaced = agreeingIds([bl]);
    spaced.documents[0].containerNumbers = ["OPLU 304172 2"];
    expect((await extractFile(file, ...twice(fake([{ documents: [bl] }], spaced))))[0].uncertain).toEqual([]);
    const other = agreeingIds([bl]);
    other.documents[0].containerNumbers = ["OPLU3041728"];
    expect((await extractFile(file, ...twice(fake([{ documents: [bl] }], other))))[0].uncertain[0].field).toBe("containers");
  });

  it("says so when the second read fails, but only on documents with bill/container numbers", async () => {
    const boom = () => { throw new Error("overloaded"); };
    const [b] = await extractFile(file, ...twice(fake([{ documents: [bl] }], boom)));
    expect(b.uncertain[0].reason).toMatch(/could not run/);
    const [i] = await extractFile(file, ...twice(fake([{ documents: [{ ...inv, houseBill: null }] }], boom)));
    expect(i.uncertain).toEqual([]);
  });

  it("a disagreement becomes an error finding pointing at the source file", async () => {
    const second = agreeingIds([bl]);
    second.documents[0].masterBill = "OPLUSGN26091775";
    const docs = await extractFile({ ...file, name: "bl.pdf" }, ...twice(fake([{ documents: [bl] }], second)));
    const f = reconcile([{ ...invoice }, ...docs]).findings.find((x) => x.id === "EXTRACTION_UNCERTAIN")!;
    expect(f.severity).toBe("error");
    expect(f.evidence[0].file).toBe("bl.pdf");
  });
});
