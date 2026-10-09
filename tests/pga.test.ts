import { describe, expect, it } from "vitest";
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { reconcile } from "../src/lib/reconcile";

/** The sample with line 1 re-described, to see what the PGA scan makes of it. */
function withLine1(description: string, fibre: string | null = null) {
  const docs = structuredClone(shipment001);
  docs[0].lineItems[0].description = description;
  docs[0].lineItems[0].fibreOrMaterial = fibre;
  return reconcile(docs).findings.filter((f) => f.id === "PGA_POSSIBLE");
}

describe("PGA_POSSIBLE", () => {
  it("stays quiet on the sample apparel (no agency beyond CBP)", () => {
    expect(reconcile(structuredClone(shipment001)).findings.map((f) => f.id)).not.toContain("PGA_POSSIBLE");
  });

  it("names the agency and the matching word", () => {
    const [f] = withLine1("BLUETOOTH WIRELESS SPEAKER");
    expect(f.severity).toBe("warning");
    expect(f.title).toMatch(/possible FCC requirements/);
    expect(f.detail).toMatch(/"BLUETOOTH"/);
    expect(f.resolution).toMatch(/<fcc-items>/);
  });

  it("can name several agencies for one line", () => {
    const [f] = withLine1("CHILDREN'S WOODEN TOY TRUCK");
    expect(f.title).toMatch(/Lacey Act \(APHIS\), CPSC/);
  });

  it("reads the fibre/material too (real fur on a garment is FWS territory)", () => {
    expect(withLine1("WOMEN'S PARKA", "Fox fur trim")[0].title).toMatch(/FWS/);
  });

  it("avoids common apparel false positives", () => {
    expect(withLine1("WOMEN'S JACKET, FAUX FUR COLLAR, IVORY")).toHaveLength(0);
    expect(withLine1("MEN'S SHELL JACKET")).toHaveLength(0);
  });

  it("never claims certainty: it points to the HTS PGA flags", () => {
    expect(withLine1("VITAMIN C SERUM")[0].detail).toMatch(/not a determination/);
  });
});
