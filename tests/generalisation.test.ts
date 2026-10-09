/**
 * Shipments we have never seen. Each variant edits the sample into a different shape
 * (currency, terms, transport mode, missing documents, missing data) and checks the app
 * degrades honestly: no crash, the right findings, and XML that validates or says why not.
 */
import { describe, expect, it } from "vitest";
import { billOfLading, invoice, packingList } from "../fixtures/shipment-001/extraction";
import type { ExtractedDoc } from "../src/lib/extract/schema";
import { emptyBrokerInputs } from "../src/lib/netchb/brokerInputs";
import { buildEntry } from "../src/lib/pipeline";

const clone = <T,>(x: T): T => structuredClone(x);
const ids = (r: Awaited<ReturnType<typeof buildEntry>>) => r.findings.map((f) => f.id);
const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, "g"))].map((m) => m[1]);

/** A clean single-factory invoice: no traps, so any finding is a real reaction to the variant. */
function cleanInvoice(): ExtractedDoc {
  const inv = clone(invoice);
  inv.lineItems = inv.lineItems.slice(0, 3);
  inv.lineItems[0].amount = 6840;
  inv.notes = inv.notes.filter((n) => !/W-B220|Item 5/.test(n));
  inv.totals.subtotal = 21975;
  inv.totals.grandTotal = 21975 + 3850 + 185;
  return inv;
}

describe("variant: EUR invoice on FOB terms", () => {
  it("asks for currency conversion, deducts nothing, emits <foreign-currency>", async () => {
    const inv = cleanInvoice();
    inv.currency = "EUR";
    inv.incoterm = "FOB";
    inv.incotermPlace = "CAT LAI";
    inv.charges = [];
    inv.totals.grandTotal = 21975;
    const r = await buildEntry([inv, billOfLading], emptyBrokerInputs());
    expect(ids(r)).toContain("FOREIGN_CURRENCY");
    expect(ids(r)).not.toContain("NON_DUTIABLE_CHARGES_EXCLUDED");
    expect(r.facts.enteredValueCents).toBe(2_197_500);
    expect(tag(r.xml, "currency-code")).toEqual(["EUR"]);
    expect(r.xsd.errors).toEqual([]);
  });
});

describe("variant: CIF but freight and insurance not itemised", () => {
  it("flags that the dutiable value is overstated instead of guessing a deduction", async () => {
    const inv = cleanInvoice();
    inv.charges = [];
    inv.totals.grandTotal = 21975;
    const r = await buildEntry([inv, billOfLading], emptyBrokerInputs());
    const f = r.findings.find((x) => x.id === "NON_DUTIABLE_CHARGES_NOT_ITEMISED")!;
    expect(f.severity).toBe("error");
    expect(f.autoApplied).toBe(false);
  });
});

describe("variant: air waybill instead of an ocean bill", () => {
  it("switches mode, drops containers and ISF, still validates", async () => {
    const awb = clone(billOfLading);
    awb.docType = "air_waybill";
    awb.containers = [];
    awb.amendments = [];
    awb.houseBill = null;
    awb.masterBill = "16012345675";
    awb.parties = awb.parties.filter((p) => p.role !== "nvocc").map((p) => (p.role === "carrier" ? { ...p, scac: "CX" } : p));
    awb.portOfDischarge = "SEATTLE, WA";
    const r = await buildEntry([cleanInvoice(), awb], emptyBrokerInputs());
    expect(r.facts.mode).toBe("air");
    expect(tag(r.xml, "mode-transportation")).toEqual(["40"]);
    expect(r.xml).not.toMatch(/<containers>/);
    expect(ids(r)).not.toContain("ISF_CHECK");
    expect(r.xsd.errors).toEqual([]);
  });
});

describe("variant: only the invoice", () => {
  it("does not crash, says the transport document is missing, reports XSD gaps honestly", async () => {
    const r = await buildEntry([cleanInvoice()], emptyBrokerInputs());
    expect(ids(r)).toContain("TRANSPORT_DOC_MISSING");
    expect(ids(r)).not.toContain("RULE_FAILED");
    expect(r.xml).toMatch(/<entry /);
    // The invoice states 138 cartons, so the manifest block can still be filled.
    expect(tag(r.xml, "quantity")).toEqual(["138"]);
  });
});

describe("variant: no HS codes anywhere", () => {
  it("marks every line as unclassified and the XML as not yet valid, with the reason", async () => {
    const inv = cleanInvoice();
    inv.lineItems.forEach((l) => (l.hsCode = null));
    const r = await buildEntry([inv, packingList, billOfLading], emptyBrokerInputs());
    expect(r.findings.filter((f) => f.id === "HTS_MISSING")).toHaveLength(3);
    expect(r.xsd.valid).toBe(false);
    expect(r.xsd.errors.join(" ")).toMatch(/tariff-no/);
  });
});

describe("variant: the seller is the factory", () => {
  it("assumes the seller made the goods, builds its MID, and asks for confirmation", async () => {
    const inv = cleanInvoice();
    inv.notes = inv.notes.filter((n) => !/contracted factory/.test(n));
    inv.parties = inv.parties.map((p) =>
      p.role === "seller" ? { ...p, name: "PHOENIX KNITWEAR CO LTD", addressLines: ["88 Le Loi Street"], city: "Da Nang", country: "Vietnam" } : p,
    );
    const bl = clone(billOfLading);
    bl.parties = bl.parties.map((p) => (p.role === "shipper" ? { ...p, name: "PHOENIX KNITWEAR CO LTD", qualifier: null } : p));
    const r = await buildEntry([inv, bl], emptyBrokerInputs());
    expect(ids(r)).toContain("MANUFACTURER_ASSUMED_SELLER");
    expect(ids(r)).not.toContain("MANUFACTURER_UNKNOWN");
    expect(tag(r.xml, "manufacturer-id")[0]).toBe("VNPHOKNI88DAN");
    expect(r.xsd.errors).toEqual([]);
  });
});

describe("variant: two invoices in one shipment", () => {
  it("keeps every line and warns that totals were only checked against the first", async () => {
    const a = cleanInvoice();
    const b = clone(a);
    b.documentNumber = "KBAS/NB/26-0913";
    b.lineItems = [{ ...a.lineItems[0], styleOrSku: "NB-T102", lineNo: "1" }];
    const r = await buildEntry([a, b, billOfLading], emptyBrokerInputs());
    expect(ids(r)).toContain("MULTIPLE_INVOICES");
    expect(r.facts.lines).toHaveLength(4);
  });
});

/**
 * Shapes seen in real Gemini output on the sample PDFs (9 Oct 2026). The hand-written
 * fixture never produced them, so they are pinned here.
 */
describe("model output: factory listed only as shipper, sister factory as manufacturer", () => {
  it("builds the Vietnam MID from the B/L shipper and never gives a VN line the BD factory", async () => {
    const pl = clone(packingList);
    pl.parties = pl.parties.filter((p) => !(p.role === "manufacturer" && /SAIGON/i.test(p.name)));
    const r = await buildEntry([clone(invoice), pl, billOfLading], emptyBrokerInputs());
    const mids = tag(r.xml, "manufacturer-id");
    expect(mids.slice(0, 4)).toEqual(["VNSAIPHO78DIA", "VNSAIPHO78DIA", "VNSAIPHO78DIA", "VNSAIPHO78DIA"]);
    expect(mids[4]).toBe("BDSPGAR41GAZ");
    expect(tag(r.xml, "country-origin")).toEqual(["VN", "VN", "VN", "VN", "BD"]);
  });

  it("leaves the MID empty and flags it rather than borrow a factory from another country", async () => {
    const pl = clone(packingList);
    pl.parties = pl.parties.filter((p) => !(p.role === "manufacturer" && /SAIGON/i.test(p.name)) && p.role !== "shipper");
    const bl = clone(billOfLading);
    bl.parties = bl.parties.filter((p) => p.role !== "shipper");
    const r = await buildEntry([clone(invoice), pl, bl], emptyBrokerInputs());
    expect(r.facts.lines.filter((l) => l.originIso === "VN").every((l) => l.manufacturerKey === null)).toBe(true);
    expect(ids(r)).toContain("LINE_MANUFACTURER_MISSING");
  });
});

describe("model output: assist footnote copied onto the line", () => {
  it("does not treat 'supplied free of charge by buyer' as a free line", async () => {
    const inv = clone(invoice);
    inv.lineItems[3].lineNotes.push(
      "(*) Style W-B220: Price is CMT (cut, make & trim) only. Main fabric supplied free of charge by buyer under buyer's fabric P.O. NB-26-0918F, value USD 4,180.00, not included in this invoice.",
    );
    const r = await buildEntry([inv, packingList, billOfLading], emptyBrokerInputs());
    const wb = r.facts.lines.find((l) => l.sku === "W-B220")!;
    expect(wb.noCommercialValue).toBe(false);
    expect(wb.enteredValueCents).toBe(544_000);
    expect(r.facts.lines[0].amountCents).toBe(684_000); // the 6,480 → 6,840 correction still proves out
    expect(r.facts.enteredValueCents).toBe(2_743_900);
  });
});

describe("model output: a generic description recorded as the manufacturer", () => {
  it("ignores 'Contracted factory in Binh Duong' (no name, no address) and uses the real factory", async () => {
    const inv = clone(invoice);
    inv.parties.push({
      role: "manufacturer", name: "Contracted factory in Binh Duong, Vietnam", addressLines: [], city: "Binh Duong",
      stateOrProvince: null, postalCode: null, country: "Vietnam", taxId: null, scac: null, qualifier: null,
    });
    const pl = clone(packingList);
    pl.parties = pl.parties.filter((p) => !(p.role === "manufacturer" && /SAIGON/i.test(p.name)));
    const r = await buildEntry([inv, pl, billOfLading], emptyBrokerInputs());
    expect(tag(r.xml, "manufacturer-id")).toEqual(["VNSAIPHO78DIA", "VNSAIPHO78DIA", "VNSAIPHO78DIA", "VNSAIPHO78DIA", "BDSPGAR41GAZ"]);
  });
});
