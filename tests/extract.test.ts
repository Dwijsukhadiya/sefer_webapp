import { describe, expect, it } from "vitest";
import { invoice } from "../fixtures/shipment-001/extraction";
import { ExtractionError, extractFile } from "../src/lib/extract/client";
import type { ExtractionProvider } from "../src/lib/extract/providers/types";

const file = { name: "inv.pdf", mediaType: "application/pdf", base64: "" };
const { sourceFile: _s, ...doc } = invoice;

/** A scripted stand-in for the model: returns each queued answer in turn and records the feedback it got. */
function fake(...answers: unknown[]): ExtractionProvider & { feedback: (string | null)[] } {
  const feedback: (string | null)[] = [];
  return {
    name: "fake",
    feedback,
    async transcribe(_f, fb) {
      feedback.push(fb);
      return { output: answers.shift() ?? null, truncated: false };
    },
  };
}

describe("extraction loop (no network)", () => {
  it("accepts schema-valid output and tags the source file", async () => {
    const docs = await extractFile(file, fake({ documents: [doc] }));
    expect(docs).toHaveLength(1);
    expect(docs[0].sourceFile).toBe("inv.pdf");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const p = fake({ documents: [{ ...doc, lineItems: "oops" }] }, { documents: [doc] });
    await extractFile(file, p);
    expect(p.feedback[0]).toBeNull();
    expect(p.feedback[1]).toMatch(/lineItems/);
  });

  it("gives up after a second bad answer instead of guessing", async () => {
    await expect(extractFile(file, fake(null, null))).rejects.toBeInstanceOf(ExtractionError);
  });

  it("rejects unsupported file types before calling the model", async () => {
    const p = fake();
    await expect(extractFile({ ...file, mediaType: "application/zip" }, p)).rejects.toThrow(/Unsupported/);
    expect(p.feedback).toHaveLength(0);
  });
});
