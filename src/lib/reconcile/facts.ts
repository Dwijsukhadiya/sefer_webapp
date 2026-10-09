/**
 * Builds a first-draft ShipmentFacts from the per-document extractions.
 * This step only decides WHICH document supplies each field (invoice for commercial
 * data, transport doc for routing). It makes no judgment calls: rules do that, and
 * every rule that changes a value records a finding.
 */
import type { ExtractedDoc, Party } from "../extract/schema";
import { usPortCode } from "../netchb/codes";
import { toIso2 } from "../util/countries";
import { parseDate } from "../util/dates";
import { toCents } from "../util/money";
import { buildMid } from "./mid";
import type { EntryLine, ManufacturerFact, PartyFact, ShipmentFacts, Source } from "./types";

export const normKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const docsOf = (docs: ExtractedDoc[], ...types: ExtractedDoc["docType"][]) =>
  docs.filter((d) => types.includes(d.docType));

export const first = <T>(...xs: (T | null | undefined)[]): T | null => {
  for (const x of xs) if (x !== null && x !== undefined && x !== "") return x;
  return null;
};

export function toPartyFact(p: Party, source: Source): PartyFact {
  return {
    name: p.name,
    addressLines: p.addressLines,
    city: p.city,
    state: p.stateOrProvince,
    postalCode: p.postalCode,
    countryIso: toIso2(p.country),
    countryRaw: p.country,
    taxId: p.taxId,
    sources: [source],
  };
}

const findParty = (docs: ExtractedDoc[], role: Party["role"]) => {
  for (const d of docs) {
    const p = d.parties.find((x) => x.role === role);
    if (p) return toPartyFact(p, d.docType);
  }
  return null;
};

/** Same company? Compare the first two significant words of the name. */
export function sameCompany(a: string, b: string): boolean {
  const sig = (s: string) =>
    s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !["THE", "CO", "LTD", "INC"].includes(w)).slice(0, 2).join(" ");
  return sig(a) !== "" && sig(a) === sig(b);
}

function collectManufacturers(docs: ExtractedDoc[], seller: PartyFact | null, origin: string | null): ManufacturerFact[] {
  const out: ManufacturerFact[] = [];
  const add = (p: PartyFact) => {
    const existing = out.find((m) => sameCompany(m.name, p.name));
    if (existing) {
      existing.sources = [...new Set([...existing.sources, ...p.sources])];
      return;
    }
    const mid = buildMid({ name: p.name, streetLine: p.addressLines[0] ?? null, city: p.city, countryIso: p.countryIso, province: p.state });
    out.push({ ...p, key: `M${out.length + 1}`, mid: mid.mid, midNeedsReview: mid.needsReview });
  };
  // "Contracted factory in Binh Duong" with no street address is a description, not a company:
  // it cannot yield a MID, and taking it would hide the real factory named elsewhere.
  const unnamed = (p: Party) => !p.addressLines.length && /\b(factory|plant|producer|manufacturer|mill|workshop|subcontractor|contracted)\b/i.test(p.name);
  for (const d of docs) for (const p of d.parties) if (p.role === "manufacturer" && !unnamed(p)) add(toPartyFact(p, d.docType));
  // A shipper that is not the seller is very often the factory. Use it when no producer is
  // named in the origin country (a sister factory elsewhere does not count). Prefer the copy
  // whose address is in the origin country: a packing list may print the factory's name with
  // its trading agent's address ("on behalf of ..."), the bill of lading the real one.
  if (!out.some((m) => !origin || m.countryIso === origin)) {
    const shippers = [...docsOf(docs, "bill_of_lading", "air_waybill"), ...docsOf(docs, "packing_list")]
      .flatMap((d) => d.parties.filter((p) => p.role === "shipper").map((p) => toPartyFact(p, d.docType)))
      .filter((p) => !seller || !sameCompany(p.name, seller.name))
      .sort((a, b) => Number(b.countryIso === origin) - Number(a.countryIso === origin));
    for (const p of shippers) add(p);
  }
  // Nobody else is named: the seller is very often the factory itself. Assume it, and say so.
  if (out.length === 0 && seller && seller.countryIso && seller.countryIso !== "US") {
    add(seller);
    out[0].assumedFromSeller = true;
  }
  return out;
}

function buildLines(invoices: ExtractedDoc[], packing: ExtractedDoc[], shipmentOrigin: string | null): EntryLine[] {
  const base = invoices.flatMap((d) => d.lineItems);
  const plItems = packing.flatMap((d) => d.lineItems);
  const primary = base.length ? base : plItems;
  return primary.map((li, i) => {
    const pl = base.length ? plItems.find((p) => normKey(p.styleOrSku) && normKey(p.styleOrSku) === normKey(li.styleOrSku)) : li;
    return {
      key: li.styleOrSku ?? li.lineNo ?? `L${i + 1}`,
      lineNo: li.lineNo,
      sku: li.styleOrSku,
      description: li.description,
      fibre: li.fibreOrMaterial ?? pl?.fibreOrMaterial ?? null,
      construction: li.construction ?? pl?.construction ?? null,
      hsAsPrinted: li.hsCode ?? pl?.hsCode ?? null,
      htsNumber: li.hsCode && li.hsCode.replace(/\D/g, "").length === 10 ? li.hsCode.replace(/\D/g, "") : null,
      quantity: li.quantity,
      uom: li.uom,
      unitPrice: li.unitPrice,
      printedAmountCents: li.amount === null ? null : toCents(li.amount),
      amountCents: li.amount === null ? null : toCents(li.amount),
      assistCents: 0,
      enteredValueCents: null,
      noCommercialValue: false,
      originIso: shipmentOrigin,
      originSource: shipmentOrigin ? "shipment-level origin statement" : "unknown",
      manufacturerKey: null,
      grossKg: pl?.grossWeightKg ?? null,
      netKg: pl?.netWeightKg ?? null,
      cartons: pl?.cartons ?? null,
      notes: [...li.lineNotes, ...(pl && pl !== li ? pl.lineNotes : [])],
    };
  });
}

export function buildFacts(docs: ExtractedDoc[]): ShipmentFacts {
  const invoices = docsOf(docs, "commercial_invoice");
  const packing = docsOf(docs, "packing_list");
  const transport = docsOf(docs, "bill_of_lading", "air_waybill");
  const inv = invoices[0];
  const tr = transport[0];

  const seller = findParty(invoices, "seller") ?? findParty(docs, "seller");
  const buyer = findParty(invoices, "buyer") ?? findParty(docs, "buyer");
  const consignee = findParty(transport, "consignee") ?? findParty(docs, "consignee");
  const shipTo = findParty(invoices, "ship_to") ?? consignee;
  const shipmentOrigin = toIso2(first(inv?.statedCountryOfOrigin, tr?.statedCountryOfOrigin));

  const nvocc = tr?.parties.find((p) => p.role === "nvocc");
  const carrier = tr?.parties.find((p) => p.role === "carrier");
  const scacPrefix = (bill: string | null) => (bill && /^[A-Z]{4}/.test(bill) ? bill.slice(0, 4) : null);
  const houseBill = first(tr?.houseBill, ...docs.map((d) => d.houseBill));
  const masterBill = first(tr?.masterBill, ...docs.map((d) => d.masterBill));

  const pod = first(tr?.portOfDischarge, inv?.portOfDischarge);
  const etd = parseDate(first(tr?.onBoardDateRaw, tr?.documentDateRaw, inv?.etdRaw));
  const eta = parseDate(first(tr?.etaRaw, inv?.etaRaw));
  const invDate = parseDate(inv?.documentDateRaw);

  const lines = buildLines(invoices, packing, shipmentOrigin);
  const charges = invoices.flatMap((d) => d.charges);
  const chargeSum = (k: string) => charges.filter((c) => c.kind === k).reduce((a, c) => a + toCents(c.amount), 0);

  const manufacturers = collectManufacturers(docs, seller, shipmentOrigin);
  // Never give a line a producer from another country: a missing MID is flagged, a wrong one is not.
  const defaultMfr = shipmentOrigin ? manufacturers.find((m) => m.countryIso === shipmentOrigin) : manufacturers[0];
  for (const l of lines) l.manufacturerKey = defaultMfr?.key ?? null;

  const loading = first(tr?.portOfLoading, inv?.portOfLoading);

  return {
    entryType: "01",
    mode: tr ? (tr.docType === "air_waybill" ? "air" : "ocean") : null,
    currency: first(inv?.currency)?.toUpperCase() ?? null,
    incoterm: first(inv?.incoterm)?.toUpperCase() ?? null,
    invoiceNumber: first(inv?.documentNumber),
    invoiceDate: invDate && invDate.candidates.length === 1 ? invDate.candidates[0] : null,
    poNumbers: [...new Set(docs.flatMap((d) => d.poNumbers))],

    importer: buyer, // provisional; IMPORTER_OF_RECORD rule explains/flags
    consignee,
    seller,
    buyer,
    shipTo,
    manufacturers,

    houseBill,
    houseScac: nvocc?.scac ?? scacPrefix(houseBill),
    masterBill,
    masterScac: carrier?.scac ?? scacPrefix(masterBill),
    vessel: first(tr?.vessel, inv?.vessel),
    voyage: first(tr?.voyage, inv?.voyage),
    portOfLoading: loading,
    portOfDischarge: pod,
    usPortCode: usPortCode(pod)?.code ?? null,
    placeOfDelivery: first(tr?.placeOfDelivery),
    exportCountryIso: toIso2(loading),
    exportDate: etd && etd.candidates.length === 1 ? etd.candidates[0] : null,
    arrivalDate: eta && eta.candidates.length === 1 ? eta.candidates[0] : null,
    containers: (tr?.containers ?? []).filter((c) => c.number).map((c) => ({ number: c.number.replace(/\s/g, ""), seals: c.sealNumbers, checkDigitValid: null, sizeType: c.sizeType })),

    packages: first(tr?.totals.totalPackages, packing[0]?.totals.totalPackages, inv?.totals.totalPackages),
    packageType: first(tr?.totals.packageType, packing[0]?.totals.packageType),
    grossKg: first(tr?.totals.grossWeightKg, packing[0]?.totals.grossWeightKg),
    netKg: first(packing[0]?.totals.netWeightKg, tr?.totals.netWeightKg),

    lines,
    freightCents: chargeSum("freight"),
    insuranceCents: chargeSum("insurance"),
    otherChargesCents: charges.filter((c) => !["freight", "insurance"].includes(c.kind)).reduce((a, c) => a + toCents(c.amount), 0),
    invoiceTotalCents: inv?.totals.grandTotal == null ? null : toCents(inv.totals.grandTotal),
    enteredValueCents: null,
    assistsCents: 0,
  };
}
