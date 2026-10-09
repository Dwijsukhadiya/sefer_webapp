import { INCOTERMS_INCLUDING_FREIGHT, INCOTERMS_INCLUDING_INSURANCE, INCOTERMS_KNOWN } from "../../netchb/codes";
import { fmt, sum } from "../../util/money";
import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * US customs value is transaction value: price actually paid, EXCLUDING separately
 * stated international freight and insurance, PLUS assists. Runs after the arithmetic
 * and assist rules so it sees corrected amounts.
 */
export const customsValue: Rule = {
  id: "CUSTOMS_VALUE",
  description: "Derive entered value per line from Incoterm, charges and assists",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const inv = docsOf(docs, "commercial_invoice")[0];
    const c = facts.currency ?? "USD";
    const term = facts.incoterm;

    for (const l of facts.lines) {
      l.enteredValueCents = l.amountCents === null ? null : l.amountCents + l.assistCents;
    }
    facts.enteredValueCents = facts.lines.every((l) => l.enteredValueCents !== null)
      ? sum(facts.lines.map((l) => l.enteredValueCents!))
      : null;

    const stated = facts.freightCents + facts.insuranceCents;
    if (!term) {
      out.push({
        id: "INCOTERM_MISSING", severity: "warning", category: "valuation", field: "incoterm",
        title: "No Incoterm stated, so it is unclear whether the price includes freight and insurance",
        detail: "Freight and insurance from the foreign port are not dutiable. Without terms of sale we cannot tell if they are baked into the prices.",
        evidence: [], resolution: "Broker must confirm terms of sale.", autoApplied: false,
      });
    } else if (!INCOTERMS_KNOWN.has(term)) {
      out.push({
        id: "INCOTERM_UNKNOWN", severity: "warning", category: "valuation", field: "incoterm",
        title: `Unrecognised terms of sale "${term}"`, detail: "Cannot determine which charges are included.",
        evidence: inv ? [ev(inv, `Incoterms: ${term} ${inv.incotermPlace ?? ""}`)] : [],
        resolution: "Broker must confirm terms of sale.", autoApplied: false,
      });
    } else if (INCOTERMS_INCLUDING_FREIGHT.has(term)) {
      const needsIns = INCOTERMS_INCLUDING_INSURANCE.has(term);
      const missing = [facts.freightCents === 0 && "freight", needsIns && facts.insuranceCents === 0 && "insurance"].filter(Boolean);
      out.push({
        id: missing.length ? "NON_DUTIABLE_CHARGES_NOT_ITEMISED" : "NON_DUTIABLE_CHARGES_EXCLUDED",
        severity: missing.length ? "error" : "info",
        category: "valuation", field: "enteredValue",
        title: missing.length
          ? `${term} price includes ${missing.join(" and ")} that is not itemised`
          : `${term} invoice: ${fmt(stated, c)} of freight and insurance excluded from dutiable value`,
        detail: missing.length
          ? `Under ${term} the seller pays international ${missing.join(" and ")}, but the invoice does not state the amount, so it cannot be deducted. Overstating value means overpaying duty.`
          : `Invoice total ${fmt(facts.invoiceTotalCents ?? 0, c)} less freight ${fmt(facts.freightCents, c)} and insurance ${fmt(facts.insuranceCents, c)} gives the goods value. Plus assists of ${fmt(facts.assistsCents, c)}, total entered value is ${fmt(facts.enteredValueCents ?? 0, c)}.`,
        evidence: inv ? [ev(inv, `Incoterms ${term} ${inv.incotermPlace ?? ""}`), ...inv.charges.map((ch) => ev(inv, `${ch.description}: ${ch.amount}`))] : [],
        resolution: missing.length
          ? "Broker must obtain the actual freight/insurance cost to deduct it."
          : "Freight and insurance are reported on the entry as non-dutiable charges (needed for the CIF value field).",
        autoApplied: !missing.length,
      });
    } else if (term === "EXW" || term === "FCA") {
      out.push({
        id: "EXW_INLAND_FREIGHT", severity: "info", category: "valuation", field: "enteredValue",
        title: `${term} terms: price excludes all transport`, detail: "Foreign inland freight paid by the buyer is not dutiable in most cases; no deduction needed from the invoice price.",
        evidence: [], resolution: "None, unless the buyer paid the seller separately for packing (packing costs are dutiable).", autoApplied: false,
      });
    }

    if (facts.currency && facts.currency !== "USD") {
      out.push({
        id: "FOREIGN_CURRENCY", severity: "error", category: "valuation", field: "currency",
        title: `Invoice is in ${facts.currency}; entered value must be in USD`,
        detail: "CBP converts using the certified Federal Reserve rate for the date of export. No document carries that rate.",
        evidence: inv ? [ev(inv, `Currency: ${facts.currency}`)] : [],
        resolution: "NetCHB applies the CBP exchange rate when the currency code is given; broker should verify.", autoApplied: false,
      });
    }
    return out;
  },
};
