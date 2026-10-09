import { z } from "zod";
import type { ShipmentFacts } from "../reconcile/types";

/** Data a broker has that no shipping document carries. Entered in the UI. */
export const BrokerInputs = z.object({
  filerCode: z.string().regex(/^[A-Z0-9]{3}$/).optional().or(z.literal("")),
  entryNumber: z.string().optional(),
  entryType: z.string().default("01"),
  importerNumber: z.string().optional().describe("IRS/EIN (NN-NNNNNNNXX) or CBP-assigned number"),
  bondType: z.enum(["", "continuous", "single"]).default(""),
  suretyCode: z.string().optional(),
  portOfEntry: z.string().optional(),
  estimatedArrival: z.string().optional(),
  referenceNumber: z.string().optional(),
  // Overrides for values the documents got wrong or left open
  importerOverride: z.enum(["", "buyer", "consignee"]).default(""),
  htsOverrides: z.record(z.string(), z.string()).default({}), // line key -> 10-digit HTS
  quantityOverrides: z.record(z.string(), z.number()).default({}),
});
export type BrokerInputs = z.infer<typeof BrokerInputs>;

export interface MissingField {
  field: string;
  label: string;
  required: boolean;
  reason: string;
}

/** Apply broker inputs on top of reconciled facts. Pure. */
export function applyBrokerInputs(facts: ShipmentFacts, b: BrokerInputs): ShipmentFacts {
  const f: ShipmentFacts = structuredClone(facts);
  f.entryType = b.entryType || f.entryType;
  if (b.portOfEntry) f.usPortCode = b.portOfEntry;
  if (b.estimatedArrival) f.arrivalDate = b.estimatedArrival;
  if (b.importerOverride === "consignee" && f.consignee) f.importer = f.consignee;
  if (b.importerOverride === "buyer" && f.buyer) f.importer = f.buyer;
  for (const l of f.lines) {
    const hts = b.htsOverrides[l.key]?.replace(/\D/g, "");
    if (hts && hts.length === 10) l.htsNumber = hts;
    const q = b.quantityOverrides[l.key];
    if (q !== undefined && l.unitPrice !== null && !l.noCommercialValue) {
      l.quantity = q;
      l.amountCents = Math.round(q * l.unitPrice * 100);
      l.enteredValueCents = l.amountCents + l.assistCents;
    } else if (q !== undefined) {
      l.quantity = q;
    }
  }
  if (f.lines.every((l) => l.enteredValueCents !== null)) f.enteredValueCents = f.lines.reduce((a, l) => a + l.enteredValueCents!, 0);
  return f;
}

export function missingFields(f: ShipmentFacts, b: BrokerInputs): MissingField[] {
  const m: MissingField[] = [];
  const need = (cond: boolean, field: string, label: string, reason: string, required = true) => {
    if (cond) m.push({ field, label, required, reason });
  };
  need(!b.filerCode, "filerCode", "Broker filer code", "Assigned by CBP to the filing broker; never on shipping documents.");
  need(!b.entryNumber, "entryNumber", "Entry number", "NetCHB can assign the next number from the broker's range; leave blank to let it.", false);
  need(!b.importerNumber, "importerNumber", "Importer of record number (IRS/EIN)", `No document carries ${f.importer?.name ?? "the importer"}'s tax ID.`);
  need(!b.bondType, "bondType", "Bond type", "Continuous or single-transaction bond; comes from the importer's account.");
  need(!b.suretyCode, "suretyCode", "Surety code", "Identifies the bond's surety company.", b.bondType === "single");
  need(!f.usPortCode, "portOfEntry", "Port of entry", "Could not map the discharge port to a CBP Schedule D code.");
  need(!f.arrivalDate, "estimatedArrival", "Estimated arrival date", "Not found on the documents.");
  for (const l of f.lines) {
    need(!l.htsNumber, `hts.${l.key}`, `10-digit HTSUS for ${l.sku ?? l.key}`, `Documents give only ${l.hsAsPrinted ?? "no code"}.`);
  }
  for (const mf of f.manufacturers) need(!mf.mid, `mid.${mf.key}`, `MID for ${mf.name}`, mf.midNeedsReview.join("; "));
  return m;
}
