import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Rule } from "../types";

/**
 * Several commercial invoices in one shipment. Each is reconciled against its own totals and
 * entered as its own <invoice>. Currency and terms are read from the first, so say so if the
 * invoices disagree.
 */
export const multipleInvoices: Rule = {
  id: "MULTIPLE_INVOICES",
  description: "More than one commercial invoice",
  run: ({ docs }) => {
    const inv = docsOf(docs, "commercial_invoice");
    if (inv.length < 2) return [];
    const differs = (pick: (d: (typeof inv)[number]) => string | null) => new Set(inv.map((d) => (pick(d) ?? "").toUpperCase())).size > 1;
    const mixed = [differs((d) => d.currency) && "currency", differs((d) => d.incoterm) && "terms of sale"].filter(Boolean);
    return [{
      id: "MULTIPLE_INVOICES",
      severity: mixed.length ? "warning" : "info",
      category: "completeness",
      field: "invoices",
      title: mixed.length
        ? `${inv.length} invoices with different ${mixed.join(" and ")}`
        : `${inv.length} commercial invoices, each reconciled and entered separately`,
      detail: mixed.length
        ? `Each invoice's arithmetic is checked on its own, but valuation uses the first invoice's ${mixed.join(" and ")}. Lines from the other invoices may be valued wrongly.`
        : "Each invoice's lines are checked against its own subtotal and total, and each becomes its own <invoice> in the NetCHB XML.",
      evidence: inv.map((d) => ev(d, `Invoice ${d.documentNumber ?? "?"}: ${d.currency ?? "?"} ${d.incoterm ?? "?"}`)),
      resolution: mixed.length ? "Broker should split the entry by currency/terms, or confirm the valuation of each invoice." : "None.",
      autoApplied: false,
    }];
  },
};
