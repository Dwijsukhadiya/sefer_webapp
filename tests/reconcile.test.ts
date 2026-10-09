import { describe, expect, it } from "vitest";
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { reconcile } from "../src/lib/reconcile";
import { DocumentExtraction } from "../src/lib/extract/schema";

const run = () => reconcile(structuredClone(shipment001));
const ids = (r: ReturnType<typeof run>) => r.findings.map((f) => f.id);
const line = (r: ReturnType<typeof run>, sku: string) => r.facts.lines.find((l) => l.sku === sku)!;

describe("fixture", () => {
  it("matches the extraction schema", () => {
    for (const d of shipment001) {
      const { sourceFile: _s, ...doc } = d;
      expect(() => DocumentExtraction.parse(doc)).not.toThrow();
    }
  });
});

describe("shipment-001 known traps", () => {
  it("1. corrects line 1 extension 6,480 -> 6,840 because only 6,840 reconciles", () => {
    const r = run();
    expect(line(r, "NB-T101").amountCents).toBe(684000);
    const f = r.findings.find((x) => x.id === "LINE_EXTENSION_MISMATCH")!;
    expect(f.autoApplied).toBe(true);
    expect(ids(r)).not.toContain("INVOICE_SUBTOTAL_MISMATCH");
    expect(ids(r)).not.toContain("INVOICE_TOTAL_MISMATCH");
  });

  it("2. catches the hoodie 1,200 vs 1,176 mismatch hidden behind matching totals", () => {
    const r = run();
    const q = r.findings.filter((x) => x.id === "QUANTITY_MISMATCH");
    expect(q).toHaveLength(1);
    expect(q[0].field).toContain("NB-H205");
    expect(ids(r)).toContain("TOTALS_MASK_LINE_MISMATCH");
  });

  it("3. adds the W-B220 fabric assist: 1,260 + 4,180 = 5,440", () => {
    const r = run();
    const l = line(r, "W-B220");
    expect(l.assistCents).toBe(418000);
    expect(l.enteredValueCents).toBe(544000);
    expect(r.findings.filter((x) => x.id === "ASSIST_DETECTED")).toHaveLength(1);
    expect(ids(r)).not.toContain("ASSIST_VALUE_MISSING");
  });

  it("4. keeps FOC samples on the entry with Bangladesh origin and the Bangladesh MID", () => {
    const r = run();
    const l = line(r, "NB-P118S");
    expect(l.noCommercialValue).toBe(true);
    expect(l.enteredValueCents).toBe(2400);
    expect(l.originIso).toBe("BD");
    const m = r.facts.manufacturers.find((x) => x.key === l.manufacturerKey)!;
    expect(m.mid).toBe("BDSPGAR41GAZ");
    expect(ids(r)).toContain("LINE_ORIGIN_DIFFERS");
    expect(ids(r)).toContain("MARKING_ORIGIN_CONFLICT");
  });

  it("5. builds the Vietnam MID from the factory, not the Hong Kong seller", () => {
    const r = run();
    const m = r.facts.manufacturers.find((x) => x.key === line(r, "NB-T101").manufacturerKey)!;
    expect(m.mid).toBe("VNSAIPHO78DIA");
    expect(ids(r)).toContain("SELLER_NOT_MANUFACTURER");
    expect(ids(r)).toContain("MID_REVIEW");
  });

  it("6. importer of record = buyer, flagged for confirmation", () => {
    const r = run();
    expect(r.facts.importer?.name).toMatch(/NORTHBOUND/);
    expect(ids(r)).toContain("IMPORTER_OF_RECORD");
  });

  it("7. entered value excludes freight + insurance and includes the assist", () => {
    const r = run();
    // 23,235 FOB + 4,180 assist + 24 samples
    expect(r.facts.enteredValueCents).toBe(2_743_900);
    expect(r.facts.freightCents).toBe(385000);
    expect(r.facts.insuranceCents).toBe(18500);
  });

  it("8. resolves the amended container number by ISO 6346 check digit, still flagged", () => {
    const r = run();
    expect(r.facts.containers[0].number).toBe("OPLU3041722");
    const f = r.findings.find((x) => x.id === "DOCUMENT_AMENDED")!;
    expect(f.autoApplied).toBe(true);
    expect(f.detail).toMatch(/original INVALID/);
  });

  it("9. flags the gross weight difference", () => {
    expect(ids(run())).toContain("GROSS_WEIGHT_MISMATCH");
  });

  it("10. never invents 10-digit HTS numbers", () => {
    const r = run();
    expect(r.facts.lines.every((l) => l.htsNumber === null)).toBe(true);
    expect(r.findings.filter((x) => x.id === "HTS_INCOMPLETE")).toHaveLength(5);
  });

  it("11. house + master bills with their own SCACs, port 3002", () => {
    const r = run();
    expect([r.facts.houseBill, r.facts.houseScac]).toEqual(["BMLVHCM26090418", "BMLV"]);
    expect([r.facts.masterBill, r.facts.masterScac]).toEqual(["OPLUSGN260917735", "OPLU"]);
    expect(r.facts.usPortCode).toBe("3002");
  });

  it("12. resolves 12/09/2026 as 12 Sep using the export date", () => {
    const r = run();
    expect(r.facts.invoiceDate).toBe("2026-09-12");
    expect(ids(r)).toContain("DATE_AMBIGUOUS");
  });

  it("13. flags the hoodie fibre conflict (60/40 cotton vs TC 65/35) as classification-relevant", () => {
    const r = run();
    const f = r.findings.find((x) => x.id === "FIBRE_MISMATCH")!;
    expect(f.field).toContain("NB-H205");
    expect(f.severity).toBe("error");
    expect(r.findings.filter((x) => x.id === "FIBRE_MISMATCH")).toHaveLength(1);
  });

  it("does not raise false alarms", () => {
    const r = run();
    for (const id of ["PACKING_LIST_MATH", "PACKING_LIST_TOTALS", "PACKAGE_COUNT_MISMATCH", "LINE_NOT_ON_INVOICE", "LINE_NOT_ON_PACKING_LIST", "RULE_FAILED", "LINE_MANUFACTURER_MISSING"])
      expect(ids(r)).not.toContain(id);
  });
});
