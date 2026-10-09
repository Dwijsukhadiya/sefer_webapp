/**
 * ShipmentFacts + BrokerInputs → NetCHB entry document tree (schemas/entry.xsd).
 * Pure: no I/O, no model calls. Element names, order and length limits follow the XSD.
 * Every time a fact has to be bent to fit the schema (shortened, reformatted, defaulted),
 * a "filing" finding says so.
 */
import type { EntryLine, Finding, PartyFact, ShipmentFacts } from "../reconcile/types";
import { isEntryNo, isFilerCode, isTaxId, type BrokerInputs } from "./brokerInputs";
import { containerSize, containerType, packageUnit, transportMode, US_STATES } from "./codes";

export const NETCHB_NS = "http://www.netchb.com/xml/entry";

export type XmlValue = string | XmlNode | Array<string | XmlNode> | undefined;
export interface XmlNode {
  [name: string]: XmlValue;
}

export interface MappedEntry {
  tree: XmlNode; // children of <entry>
  notes: Finding[];
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const wholeDollars = (cents: number) => String(Math.round(cents / 100));
const cut = (s: string | null | undefined, max: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) : undefined);

/** data:invoiceNoType allows only letters, digits and hyphens, max 17. */
export function xmlInvoiceNo(raw: string): string {
  return raw.replace(/[^A-Za-z0-9-]/g, "").slice(0, 17);
}

/** Ocean bills are printed SCAC + number; NetCHB takes the SCAC and the number separately. */
export function splitBill(bill: string | null, scac: string | null): string | undefined {
  if (!bill) return undefined;
  const b = bill.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return scac && b.startsWith(scac.toUpperCase()) && b.length > scac.length ? b.slice(scac.length) : b;
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bLIMITED\b/gi, "LTD"], [/\bCOMPANY\b/gi, "CO"], [/\bCORPORATION\b/gi, "CORP"],
  [/\bINCORPORATED\b/gi, "INC"], [/\bINTERNATIONAL\b/gi, "INTL"], [/\bJOINT STOCK COMPANY\b/gi, "JSC"],
];
/** Entity names are max 35 chars. Abbreviate legal suffixes before truncating. */
export function entityName(name: string): string {
  let n = name.replace(/\s+/g, " ").trim();
  if (n.length <= 35) return n;
  for (const [re, short] of ABBREVIATIONS) n = n.replace(re, short);
  return n.slice(0, 35).trim();
}

/** Free-text address lines → up to 6 "unstructured street address" components of ≤35 chars. */
function addressComponents(lines: string[]): XmlNode[] {
  const parts: string[] = [];
  for (const line of lines) {
    let cur = "";
    for (const piece of line.split(/,\s*/)) {
      const next = cur ? `${cur}, ${piece}` : piece;
      if (next.length <= 35) cur = next;
      else {
        if (cur) parts.push(cur);
        cur = piece.slice(0, 35);
      }
    }
    if (cur) parts.push(cur);
  }
  return parts.slice(0, 6).map((p) => ({ "component-type": "15", "address-information": p }));
}

function entity(code: "SE" | "BY" | "ST" | "MF", p: PartyFact | null): XmlNode | undefined {
  if (!p || !p.city || !p.countryIso || !p.addressLines.length) return undefined;
  return {
    "entity-code": code,
    "entity-name": entityName(p.name),
    "entity-information": {
      "entity-address": {
        "address-components": { "address-component": addressComponents(p.addressLines) },
        city: cut(p.city, 35),
        "state-province-code": p.state && p.state.length <= 3 ? p.state.toUpperCase() : undefined,
        "postal-code": cut(p.postalCode, 15),
        country: p.countryIso,
      },
    },
  };
}

function tariffNumber(l: EntryLine): string | undefined {
  if (l.htsNumber) return l.htsNumber;
  const d = (l.hsAsPrinted ?? "").replace(/\D/g, "");
  return d.length >= 5 && d.length <= 10 ? d : undefined; // data:tariffNoType is \d{5,10}
}

const note = (id: string, field: string, title: string, detail: string, resolution: string): Finding => ({
  id, severity: "info", category: "filing", field, title, detail, evidence: [], resolution, autoApplied: true,
});

/** The order lines appear in the XML: grouped by source invoice (packing-list-only lines join the first). */
export function xmlLineOrder(f: ShipmentFacts): EntryLine[] {
  const count = Math.max(1, f.invoiceNumbers.length);
  return Array.from({ length: count }, (_, i) => f.lines.filter((l) => (l.invoice ?? 0) === i)).flat();
}

export function mapEntry(f: ShipmentFacts, b: BrokerInputs): MappedEntry {
  const notes: Finding[] = [];

  // ---- entry number --------------------------------------------------------
  const entryNo: XmlNode =
    isFilerCode(b.filerCode) && isEntryNo(b.entryNumber)
      ? { "user-specified": { "filer-code": b.filerCode.trim().toUpperCase(), "entry-no": b.entryNumber.trim() } }
      : { "system-generated": {} };

  notes.push(note("XML_NOT_TRANSMITTED", "transmit",
    "The XML has no <transmit/> tag, so uploading it stages the entry in NetCHB without sending anything to CBP",
    "Per entry.xsd: \"The <transmit /> tag is optional. If included, NetChb will automatically transmit the entry summary to customs once the upload of this entry is complete.\" This tool never adds it.",
    "A licensed broker reviews the staged entry in NetCHB and transmits it from there."));

  // ---- header --------------------------------------------------------------
  const entryDate = b.entryDate || f.arrivalDate || undefined;
  if (!b.entryDate && f.arrivalDate) {
    notes.push(note("XML_ENTRY_DATE_ASSUMED", "header.entry-date",
      `Entry date set to the estimated arrival date, ${f.arrivalDate}`,
      "NetCHB requires an entry date. No document carries one; the estimated arrival is the usual starting point for a pre-arrival entry.",
      "Broker should set the actual entry date."));
  }

  const importer = f.importer;
  const shipToState = f.shipTo?.state?.toUpperCase();
  const stateDest = shipToState && US_STATES.has(shipToState) ? shipToState : importer?.state?.toUpperCase();
  const charges = f.freightCents + f.insuranceCents;
  const port = f.usPortCode ?? undefined;

  const header: XmlNode = {
    "importer-tax-id": isTaxId(b.importerNumber) ? b.importerNumber.trim() : undefined,
    "importer-name": importer?.name,
    "ultimate-consignee": importer
      ? {
          "tax-id": isTaxId(b.ultimateConsigneeTaxId) ? b.ultimateConsigneeTaxId.trim() : isTaxId(b.importerNumber) ? b.importerNumber.trim() : undefined,
          "consignee-name": importer.name,
        }
      : undefined,
    "processing-port": port,
    "entry-port": port,
    "entry-date": entryDate,
    "entry-type": f.entryType,
    "bond-type": b.bondType === "continuous" ? "08" : b.bondType === "single" ? "09" : undefined,
    charges: charges > 0 ? wholeDollars(charges) : undefined,
    "gross-weight": f.grossKg !== null ? String(Math.round(f.grossKg)) : undefined,
    "total-entry-value": f.enteredValueCents !== null && f.enteredValueCents >= 100 ? wholeDollars(f.enteredValueCents) : undefined,
    "surety-code": cut(b.suretyCode, 3),
    "state-destination": stateDest && US_STATES.has(stateDest) ? stateDest : undefined,
    "vessel-name": cut(f.vessel, 20),
    "mode-transportation": transportMode(f.mode, f.containers.length > 0) ?? undefined,
    "unlading-port": port,
    "import-date": f.arrivalDate ?? undefined,
    "arrival-date": f.arrivalDate ?? undefined,
    "carrier-code": f.masterScac ?? f.houseScac ?? undefined,
    "broker-reference-no": cut(b.referenceNumber, 9),
    "customer-reference-no": cut(f.poNumbers.join(", "), 50),
    "voyage-no": cut(f.voyage, 5),
  };
  if (charges > 0 || f.enteredValueCents !== null) {
    notes.push(note("XML_HEADER_WHOLE_DOLLARS", "header.charges",
      "Header charges and total entered value are whole dollars",
      `entry.xsd types <charges> and <total-entry-value> as integers. Charges ${dollars(charges)} → ${wholeDollars(charges)}; entered value ${dollars(f.enteredValueCents ?? 0)} → ${wholeDollars(f.enteredValueCents ?? 0)}. Line values keep cents.`,
      "None; NetCHB recomputes header totals from the lines."));
  }
  if (f.shipTo && f.importer && f.shipTo.name !== f.importer.name && stateDest) {
    notes.push(note("XML_STATE_OF_DESTINATION", "header.state-destination",
      `State of destination ${stateDest}, from the delivery address (${f.shipTo.name}), not the importer's ${f.importer.state ?? "?"}`,
      "CBP wants the state where the goods are delivered, which here is the ship-to warehouse.",
      "Broker should confirm."));
  }

  // ---- manifest ------------------------------------------------------------
  const masterBill = splitBill(f.masterBill, f.masterScac);
  const houseBill = splitBill(f.houseBill, f.houseScac);
  if ((f.masterBill && masterBill !== f.masterBill) || (f.houseBill && houseBill !== f.houseBill)) {
    notes.push(note("XML_BILL_SCAC_SPLIT", "manifest.bill-of-lading",
      "Bill numbers split into SCAC + bill number",
      `NetCHB has separate SCAC and bill fields. Master ${f.masterBill ?? "-"} → ${f.masterScac ?? "?"} + ${masterBill ?? "-"}; house ${f.houseBill ?? "-"} → ${f.houseScac ?? "?"} + ${houseBill ?? "-"}. This follows the AMS convention where the printed bill number begins with the issuer's SCAC.`,
      "Broker should confirm the bill numbers match the carrier's AMS filing."));
  }
  const unit = packageUnit(f.packageType);
  const manifest: XmlNode = {
    "bill-of-lading": [{
      "master-scac": masterBill ? f.masterScac ?? undefined : undefined,
      "master-bill": masterBill,
      "house-scac": houseBill ? f.houseScac ?? undefined : undefined,
      "house-bill": houseBill,
      quantity: f.packages !== null ? String(f.packages) : undefined,
      unit: unit ?? undefined,
    }],
  };

  // ---- containers ----------------------------------------------------------
  const containers: XmlNode | undefined = f.containers.length
    ? {
        container: f.containers.map((c) => ({
          "container-number": c.number,
          "container-size": containerSize(c.sizeType) ?? undefined,
          "container-type": containerType(c.sizeType) ?? undefined,
          "seal-numbers": c.seals.length ? c.seals.join(",") : undefined,
        })),
      }
    : undefined;

  // ---- parties (ACE cargo release block; optional but documents who is who) -
  const parties = [entity("SE", f.seller), entity("BY", f.buyer), entity("ST", f.shipTo)].filter((x): x is XmlNode => !!x);
  const shortened = [f.seller, f.buyer, f.shipTo].filter((p): p is PartyFact => !!p && entityName(p.name) !== p.name.replace(/\s+/g, " ").trim());
  if (shortened.length) {
    notes.push(note("XML_ENTITY_NAME_SHORTENED", "ace-cargo-release-parties",
      "Party names shortened to NetCHB's 35-character limit",
      shortened.map((p) => `"${p.name}" → "${entityName(p.name)}"`).join("; "),
      "None needed unless the broker's NetCHB party profile uses a different name."));
  }

  // ---- invoice + lines -----------------------------------------------------
  // One <invoice> per commercial invoice. Lines known only from a packing list join the first.
  const sourceInvoices = f.invoiceNumbers.length ? f.invoiceNumbers : [f.invoiceNumber];
  const renamed = sourceInvoices.filter((n): n is string => !!n && xmlInvoiceNo(n) !== n);
  if (renamed.length) {
    notes.push(note("XML_INVOICE_NO_NORMALISED", "invoice.invoice-no",
      renamed.map((n) => `Invoice number "${n}" entered as "${xmlInvoiceNo(n)}"`).join("; "),
      "entry.xsd allows only letters, digits and hyphens in an invoice number (max 17), so the other characters were removed.",
      "Broker should confirm this matches how the invoice is referenced in their records."));
  }

  const lineItem = (l: EntryLine): XmlNode => {
    const mfr = f.manufacturers.find((m) => m.key === l.manufacturerKey);
    return {
      "export-date": f.exportDate ?? undefined,
      "country-origin": l.originIso ?? undefined,
      "manufacturer-id": mfr?.mid ?? undefined,
      "related-party": b.relatedParty || undefined,
      tariffs: {
        tariff: [{
          "tariff-no": tariffNumber(l),
          value: l.enteredValueCents !== null ? dollars(l.enteredValueCents) : undefined,
        }],
      },
      "country-export": f.exportCountryIso ?? undefined,
      "gross-weight": l.grossKg !== null ? String(Math.round(l.grossKg)) : undefined,
      "commercial-description": [l.description, l.fibre, l.construction].filter(Boolean).join(", "),
      "invoice-quantity": l.quantity !== null ? String(l.quantity) : undefined,
      "po-number": f.poNumbers[0],
    };
  };
  const assisted = f.lines.filter((l) => l.assistCents > 0);
  if (assisted.length) {
    notes.push(note("XML_ASSIST_IN_LINE_VALUE", "invoice.line-items.tariff.value",
      `Assists are included in the line value (${assisted.map((l) => `${l.sku ?? l.key}: ${dollars(l.amountCents ?? 0)} + ${dollars(l.assistCents)}`).join("; ")})`,
      "entry.xsd has no assist element; its value-adjustment tag is documented only for proration. The tariff <value> is the entered value, which by law includes assists.",
      "Broker should confirm how their NetCHB account records assists (some brokers also note them in the line description)."));
  }
  const unpadded = f.lines.filter((l) => !l.htsNumber && tariffNumber(l));
  if (unpadded.length) {
    notes.push(note("XML_HTS_AS_PRINTED", "invoice.line-items.tariff-no",
      `${unpadded.length} line(s) carry the tariff number exactly as printed (${unpadded.map((l) => l.hsAsPrinted).join(", ")}), not padded to 10 digits`,
      "entry.xsd accepts 5 to 10 digits, so the file validates, but CBP needs a 10-digit HTSUS number. Padding with zeros would look like a real classification, so the digits are left as printed and NetCHB will flag them.",
      "Broker must classify each line to 10 digits (enter them in the HTS fields)."));
  }

  const invoices: XmlNode[] = sourceInvoices.map((number, index) => ({
    "invoice-no": number ? xmlInvoiceNo(number) : undefined,
    "foreign-currency": f.currency && f.currency !== "USD" ? { "currency-code": f.currency } : undefined,
    "line-items": { "line-item": f.lines.filter((l) => (l.invoice ?? 0) === index).map(lineItem) },
  }));

  // Root children must follow the xsd:sequence order exactly.
  const tree: XmlNode = {
    "entry-no": entryNo,
    "external-reference-number": cut(f.houseBill ?? f.invoiceNumber ?? undefined, 100),
    header,
    manifest,
    containers,
    "ace-cargo-release-parties": parties.length ? { entity: parties } : undefined,
    invoices: { invoice: invoices },
  };
  return { tree, notes };
}
