import { z } from "zod";
import type { ShipmentFacts } from "../reconcile/types";

const TAX_ID = /^(\d{2}-\d{7}[\dA-Za-z]?[\dA-Za-z]?|\d{6}-\d{5}|\d{3}-\d{2}-\d{4})$/; // data:taxIdType

/** Data a broker has that no shipping document carries. Entered in the UI. */
export const BrokerInputs = z.object({
  // Free text so a half-typed value never breaks the rebuild; patterns are enforced when mapping.
  filerCode: z.string().optional(),
  entryNumber: z.string().optional(),
  entryType: z.string().default("01"),
  entryDate: z.string().optional().describe("yyyy-mm-dd; defaults to the estimated arrival date"),
  importerNumber: z.string().optional().describe("IRS/EIN (NN-NNNNNNNXX) or CBP-assigned number"),
  ultimateConsigneeTaxId: z.string().optional(),
  bondType: z.enum(["", "continuous", "single"]).default(""),
  suretyCode: z.string().optional(),
  portOfEntry: z.string().optional(),
  estimatedArrival: z.string().optional(),
  referenceNumber: z.string().optional(),
  relatedParty: z.enum(["", "Y", "N"]).default(""),
  // Overrides for values the documents got wrong or left open
  importerOverride: z.enum(["", "buyer", "consignee"]).default(""),
  containerNumbers: z.array(z.string()).optional(),
  htsOverrides: z.record(z.string(), z.string()).default({}), // line key -> 10-digit HTS
  quantityOverrides: z.record(z.string(), z.number()).default({}),
});
export type BrokerInputs = z.infer<typeof BrokerInputs>;
export const emptyBrokerInputs = (): BrokerInputs => BrokerInputs.parse({});

export const isFilerCode = (s: string | undefined): s is string => !!s && /^[A-Za-z0-9]{3}$/.test(s.trim());
export const isEntryNo = (s: string | undefined): s is string => !!s && /^\d{7,8}$/.test(s.trim());
export const isTaxId = (s: string | undefined): s is string => !!s && TAX_ID.test(s.trim());

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
  if (b.containerNumbers?.length) {
    f.containers = b.containerNumbers.map((n, i) => ({ ...(f.containers[i] ?? { seals: [], checkDigitValid: null, sizeType: null }), number: n.replace(/\s/g, "").toUpperCase() }));
  }
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
  need(!!b.entryNumber && !(isFilerCode(b.filerCode) && isEntryNo(b.entryNumber)), "entryNumber", "Valid filer code + entry number", "A user-specified entry number needs a 3-character filer code and a 7-digit number; until both are valid NetCHB generates the number.", false);
  need(!b.filerCode, "filerCode", "Broker filer code", "Assigned by CBP to the filing broker; never on shipping documents. Without it NetCHB generates the entry number from the account's own range.", false);
  need(!isTaxId(b.importerNumber), "importerNumber", "Importer of record number (IRS/EIN)", `No document carries ${f.importer?.name ?? "the importer"}'s tax ID. NetCHB requires it for every entry type except 86.`);
  need(!b.bondType, "bondType", "Bond type", "Continuous (08) or single-transaction (09); comes from the importer's account.");
  need(!b.suretyCode, "suretyCode", "Surety code", "Identifies the bond's surety company.", b.bondType === "single");
  need(!f.usPortCode, "portOfEntry", "Port of entry", "Could not map the discharge port to a CBP Schedule D code.");
  need(!b.entryDate && !f.arrivalDate, "entryDate", "Entry date", "Required by NetCHB. Defaults to the estimated arrival date, which no document gives.");
  need(!f.arrivalDate, "estimatedArrival", "Estimated arrival date", "Not found on the documents.");
  need(!b.relatedParty, "relatedParty", "Related-party indicator", "Whether buyer and seller are related (19 U.S.C. 1401a(g)). No document says; the importer must declare it.");
  need(true, "ladingPort", "Foreign port of lading (Schedule K)", `The documents name "${f.portOfLoading ?? "?"}", but the 5-digit Schedule K code is not mapped by this tool.`, false);
  for (const l of f.lines) {
    need(!l.htsNumber, `hts.${l.key}`, `10-digit HTSUS for ${l.sku ?? l.key}`, `Documents give only ${l.hsAsPrinted ?? "no code"}. The 10-digit number also fixes the reporting units (apparel is usually DOZ + KG).`);
  }
  for (const mf of f.manufacturers) need(!mf.mid, `mid.${mf.key}`, `MID for ${mf.name}`, mf.midNeedsReview.join("; "));
  return m;
}
