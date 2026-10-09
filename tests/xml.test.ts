import { describe, expect, it } from "vitest";
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { BrokerInputs, emptyBrokerInputs } from "../src/lib/netchb/brokerInputs";
import { entityName, splitBill, xmlInvoiceNo } from "../src/lib/netchb/map";
import { validateEntryXml } from "../src/lib/netchb/validate";
import { buildEntry } from "../src/lib/pipeline";

const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, "g"))].map((m) => m[1]);

describe("NetCHB XML for shipment-001", () => {
  it("validates against NetCHB's entry.xsd with no broker input at all", async () => {
    const r = await buildEntry(shipment001, emptyBrokerInputs());
    expect(r.xsd.errors).toEqual([]);
    expect(r.xsd.valid).toBe(true);
  });

  it("never includes the <transmit/> tag", async () => {
    const { xml } = await buildEntry(shipment001, emptyBrokerInputs());
    expect(xml).not.toMatch(/<transmit/);
  });

  it("carries the reconciled values, not the printed ones", async () => {
    const { xml } = await buildEntry(shipment001, emptyBrokerInputs());
    expect(tag(xml, "value")).toEqual(["6840.00", "8880.00", "6255.00", "5440.00", "24.00"]);
    expect(tag(xml, "country-origin")).toEqual(["VN", "VN", "VN", "VN", "BD"]);
    expect(tag(xml, "manufacturer-id")).toEqual(["VNSAIPHO78DIA", "VNSAIPHO78DIA", "VNSAIPHO78DIA", "VNSAIPHO78DIA", "BDSPGAR41GAZ"]);
    expect(tag(xml, "tariff-no")).toEqual(["610910", "611020", "620342", "620640", "610610"]); // as printed, never padded
    expect(tag(xml, "charges")).toEqual(["4035"]);
    expect(tag(xml, "total-entry-value")).toEqual(["27439"]);
  });

  it("splits house and master bills into SCAC + number", async () => {
    const { xml } = await buildEntry(shipment001, emptyBrokerInputs());
    expect(tag(xml, "master-scac")).toEqual(["OPLU"]);
    expect(tag(xml, "master-bill")).toEqual(["SGN260917735"]);
    expect(tag(xml, "house-scac")).toEqual(["BMLV"]);
    expect(tag(xml, "house-bill")).toEqual(["HCM26090418"]);
    expect(tag(xml, "entry-port")).toEqual(["3002"]);
  });

  it("uses broker inputs when given, and stays valid", async () => {
    const broker = BrokerInputs.parse({
      filerCode: "ABC", entryNumber: "1234567", importerNumber: "12-3456789AB", bondType: "continuous",
      suretyCode: "036", relatedParty: "N", entryDate: "2026-10-15",
      htsOverrides: { "NB-T101": "6109.10.0012" }, containerNumbers: ["OPLU3041728"],
    });
    const r = await buildEntry(shipment001, broker);
    expect(r.xsd.errors).toEqual([]);
    expect(r.xml).toMatch(/<user-specified>\s*<filer-code>ABC<\/filer-code>\s*<entry-no>1234567<\/entry-no>/);
    expect(tag(r.xml, "importer-tax-id")).toEqual(["12-3456789AB"]);
    expect(tag(r.xml, "bond-type")).toEqual(["08"]);
    expect(tag(r.xml, "tariff-no")[0]).toBe("6109100012");
    expect(tag(r.xml, "container-number")).toEqual(["OPLU3041728"]);
    expect(r.missing.map((m) => m.field)).not.toContain("importerNumber");
  });

  it("explains every schema compromise as a filing finding", async () => {
    const ids = (await buildEntry(shipment001, emptyBrokerInputs())).findings.filter((f) => f.category === "filing").map((f) => f.id);
    for (const id of ["XML_NOT_TRANSMITTED", "XML_INVOICE_NO_NORMALISED", "XML_BILL_SCAC_SPLIT", "XML_ENTITY_NAME_SHORTENED", "XML_ENTRY_DATE_ASSUMED", "XML_HTS_AS_PRINTED", "XML_ASSIST_IN_LINE_VALUE"])
      expect(ids).toContain(id);
  });

  it("the validator really rejects bad documents", async () => {
    const { xml } = await buildEntry(shipment001, emptyBrokerInputs());
    const r = await validateEntryXml(xml.replace("KBASNB26-0912", "KBAS/NB/26-0912"));
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/invoice-no/);
  });
});

describe("schema helpers", () => {
  it("invoice numbers keep only letters, digits, hyphens (max 17)", () => {
    expect(xmlInvoiceNo("KBAS/NB/26-0912")).toBe("KBASNB26-0912");
    expect(xmlInvoiceNo("INV 2026/000123/ABCDEFG")).toHaveLength(17);
  });
  it("strips the SCAC prefix only when present", () => {
    expect(splitBill("OPLUSGN260917735", "OPLU")).toBe("SGN260917735");
    expect(splitBill("SGN260917735", "OPLU")).toBe("SGN260917735");
    expect(splitBill("MAEU-123 456", null)).toBe("MAEU123456");
  });
  it("shortens entity names to 35 chars, abbreviating legal suffixes first", () => {
    expect(entityName("KOWLOON BAY APPAREL SOURCING LIMITED")).toBe("KOWLOON BAY APPAREL SOURCING LTD");
    expect(entityName("SHORT NAME LIMITED")).toBe("SHORT NAME LIMITED");
  });
});

describe("plain-language XSD errors", () => {
  it("names the line and where to fix a missing tariff number", async () => {
    const docs = structuredClone(shipment001);
    docs[0].lineItems.forEach((l) => (l.hsCode = null));
    const r = await buildEntry(docs, emptyBrokerInputs());
    expect(r.xsdIssues.map((i) => i.message)).toEqual(
      ["NB-T101", "NB-H205", "NB-C330", "W-B220", "NB-P118S"].map((sku) => `Line ${sku}: no tariff number. Enter its 10-digit HTS under Entry lines.`),
    );
    expect(r.xsdIssues[0].raw).toMatch(/Missing child element/);
  });

  it("explains a missing bill of lading without XML jargon", async () => {
    const r = await buildEntry([structuredClone(shipment001[0])], emptyBrokerInputs());
    expect(r.xsdIssues.map((i) => i.message)).toEqual([expect.stringMatching(/^No bill of lading or air waybill number/)]);
  });

  it("explains a malformed importer number", async () => {
    const r = await buildEntry(shipment001, BrokerInputs.parse({}));
    expect(r.xsdIssues).toEqual([]); // valid entry: nothing to explain
    const { explainXsdErrors } = await import("../src/lib/netchb/explainXsd");
    const raw = "line 9: Schemas validity error : Element '{http://www.netchb.com/xml/entry}importer-tax-id': [facet 'pattern'] The value '123' is not accepted by the pattern 'x'.";
    expect(explainXsdErrors([raw], r.xml, r.facts)[0].message).toMatch(/Importer number "123" is not a valid IRS\/EIN/);
  });
});
