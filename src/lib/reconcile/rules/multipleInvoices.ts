import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Rule } from "../types";

/** Several commercial invoices in one shipment: lines are merged, but totals checks only cover the first. */
export const multipleInvoices: Rule = {
  id: "MULTIPLE_INVOICES",
  description: "More than one commercial invoice",
  run: ({ docs }) => {
    const inv = docsOf(docs, "commercial_invoice");
    if (inv.length < 2) return [];
    return [{
      id: "MULTIPLE_INVOICES", severity: "warning", category: "completeness", field: "invoices",
      title: `${inv.length} commercial invoices uploaded; lines are combined under the first invoice number`,
      detail: "This version reconciles subtotal, total, terms and currency against the first invoice only, and writes a single <invoice> in the XML. NetCHB itself accepts several invoices per entry.",
      evidence: inv.map((d) => ev(d, `Invoice ${d.documentNumber ?? "?"}`)),
      resolution: "Broker should split the lines by invoice in NetCHB, or file one entry per invoice.",
      autoApplied: false,
    }];
  },
};
