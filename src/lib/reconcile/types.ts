import type { DocType, ExtractedDoc } from "../extract/schema";
import type { Cents } from "../util/money";

export type Source = DocType | "broker_input" | "derived";

export interface Evidence {
  source: Source;
  file?: string;
  text: string;
}

export type Severity = "error" | "warning" | "info";
export type FindingCategory =
  | "arithmetic"
  | "quantity"
  | "valuation"
  | "origin"
  | "parties"
  | "transport"
  | "classification"
  | "dates"
  | "marking"
  | "completeness";

export interface Finding {
  id: string; // stable rule id, e.g. "LINE_EXTENSION_MISMATCH"
  severity: Severity;
  category: FindingCategory;
  field: string; // dotted path into ShipmentFacts, e.g. "lines[0].amount"
  title: string; // one line, broker-readable
  detail: string; // what we saw and why it matters
  evidence: Evidence[];
  resolution: string; // what we did, or what a human must do
  autoApplied: boolean; // true = we changed a value on the entry (detail shows both)
}

export interface PartyFact {
  name: string;
  addressLines: string[];
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryIso: string | null;
  countryRaw: string | null;
  taxId: string | null;
  sources: Source[];
}

export interface ManufacturerFact extends PartyFact {
  key: string; // stable id used by lines
  mid: string | null;
  midNeedsReview: string[];
}

export interface EntryLine {
  key: string; // style/SKU, else line number
  lineNo: string | null;
  sku: string | null;
  description: string;
  fibre: string | null;
  construction: string | null;
  hsAsPrinted: string | null;
  htsNumber: string | null; // only set when a full 10-digit number is known
  quantity: number | null; // the quantity we enter (see findings if docs disagree)
  uom: string | null;
  unitPrice: number | null;
  printedAmountCents: Cents | null;
  amountCents: Cents | null; // after arithmetic reconciliation
  assistCents: Cents;
  enteredValueCents: Cents | null; // dutiable value for this line
  noCommercialValue: boolean;
  originIso: string | null;
  originSource: string; // why we believe the origin
  manufacturerKey: string | null;
  grossKg: number | null;
  netKg: number | null;
  cartons: number | null;
  notes: string[];
}

export interface ContainerFact {
  number: string;
  seals: string[];
  checkDigitValid: boolean | null;
}

export interface ShipmentFacts {
  entryType: string; // "01" consumption by default
  mode: "ocean" | "air" | null;
  currency: string | null;
  incoterm: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO, null if unresolved
  poNumbers: string[];

  importer: PartyFact | null;
  consignee: PartyFact | null;
  seller: PartyFact | null;
  buyer: PartyFact | null;
  manufacturers: ManufacturerFact[];

  houseBill: string | null;
  houseScac: string | null;
  masterBill: string | null;
  masterScac: string | null;
  vessel: string | null;
  voyage: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  usPortCode: string | null;
  placeOfDelivery: string | null;
  exportCountryIso: string | null;
  exportDate: string | null;
  arrivalDate: string | null;
  containers: ContainerFact[];

  packages: number | null;
  packageType: string | null;
  grossKg: number | null;
  netKg: number | null;

  lines: EntryLine[];

  freightCents: Cents;
  insuranceCents: Cents;
  otherChargesCents: Cents;
  invoiceTotalCents: Cents | null;
  enteredValueCents: Cents | null;
  assistsCents: Cents;
}

export interface RuleContext {
  docs: ExtractedDoc[];
  facts: ShipmentFacts; // rules may refine facts; anything they change must emit autoApplied:true
}

export interface Rule {
  id: string;
  description: string;
  run: (ctx: RuleContext) => Finding[];
}
