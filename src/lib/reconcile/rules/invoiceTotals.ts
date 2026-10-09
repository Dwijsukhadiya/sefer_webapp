import { fmt, sum, toCents } from "../../util/money";
import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

/** Lines (after arithmetic fixes) + separately stated charges must equal the invoice total. */
export const invoiceTotals: Rule = {
  id: "INVOICE_TOTAL_MISMATCH",
  description: "Sum of line amounts and charges vs printed subtotal and total",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const inv = docsOf(docs, "commercial_invoice")[0];
    if (!inv) return out;
    const c = facts.currency ?? "USD";
    const goods = sum(facts.lines.filter((l) => !l.noCommercialValue).map((l) => l.amountCents ?? 0));
    const charges = facts.freightCents + facts.insuranceCents + facts.otherChargesCents;

    if (inv.totals.subtotal !== null && toCents(inv.totals.subtotal) !== goods) {
      out.push({
        id: "INVOICE_SUBTOTAL_MISMATCH", severity: "error", category: "arithmetic", field: "invoice.subtotal",
        title: "Line amounts do not add up to the invoice subtotal",
        detail: `Lines sum to ${fmt(goods, c)}; invoice subtotal is ${fmt(toCents(inv.totals.subtotal), c)}.`,
        evidence: [ev(inv, `Subtotal ${inv.totals.subtotal}`)],
        resolution: "Broker must resolve with the seller; entered values use the line amounts.",
        autoApplied: false,
      });
    }
    if (inv.totals.grandTotal !== null && toCents(inv.totals.grandTotal) !== goods + charges) {
      out.push({
        id: "INVOICE_TOTAL_MISMATCH", severity: "error", category: "arithmetic", field: "invoice.total",
        title: "Goods plus charges do not equal the invoice total",
        detail: `Goods ${fmt(goods, c)} + charges ${fmt(charges, c)} = ${fmt(goods + charges, c)}; invoice total is ${fmt(toCents(inv.totals.grandTotal), c)}.`,
        evidence: [ev(inv, `Total ${inv.totals.grandTotal}`)],
        resolution: "Check for unlisted charges, discounts or rebates; they may affect transaction value.",
        autoApplied: false,
      });
    }
    return out;
  },
};
