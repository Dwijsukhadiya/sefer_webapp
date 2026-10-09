import { extend, fmt, sum, toCents } from "../../util/money";
import { docsOf } from "../facts";
import { allNotes, lineLabel } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * qty × unit price must equal the printed extension. When they disagree, the printed
 * subtotal decides which one is right: if only the recomputed figure reconciles, the
 * printed extension was a typo and we correct it (and say so).
 */
export const lineArithmetic: Rule = {
  id: "LINE_EXTENSION_MISMATCH",
  description: "Recompute each line extension and reconcile against the printed subtotal",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const inv = docsOf(docs, "commercial_invoice")[0];
    const subtotal = inv?.totals.subtotal == null ? null : toCents(inv.totals.subtotal);
    const currency = facts.currency ?? "USD";
    const paid = facts.lines.filter((l) => !l.noCommercialValue);

    for (const line of paid) {
      if (line.quantity === null || line.unitPrice === null || line.printedAmountCents === null) continue;
      const computed = extend(line.quantity, line.unitPrice);
      if (computed === line.printedAmountCents) continue;

      const others = sum(paid.filter((l) => l !== line).map((l) => l.amountCents ?? 0));
      const computedReconciles = subtotal !== null && others + computed === subtotal;
      const printedReconciles = subtotal !== null && others + line.printedAmountCents === subtotal;
      // Carried-forward page subtotals are extra evidence, not required.
      const carried = allNotes([inv]).map((n) => n.text).find((t) => /carried forward|brought forward/i.test(t));

      if (computedReconciles) line.amountCents = computed;
      out.push({
        id: "LINE_EXTENSION_MISMATCH",
        severity: "error",
        category: "arithmetic",
        field: `lines[${line.key}].amount`,
        title: `${lineLabel(line)}: printed amount does not equal quantity × unit price`,
        detail:
          `${line.quantity} × ${line.unitPrice} = ${fmt(computed, currency)}, but the invoice prints ${fmt(line.printedAmountCents, currency)}. ` +
          (computedReconciles
            ? `The invoice subtotal of ${fmt(subtotal!, currency)} only adds up with ${fmt(computed, currency)}, so the printed extension is a typo.`
            : printedReconciles
              ? `The subtotal adds up with the printed amount, so the quantity or unit price may be what is wrong.`
              : `Neither figure reconciles with the stated subtotal.`),
        evidence: [
          { source: "commercial_invoice", file: inv?.sourceFile, text: `${line.sku ?? ""} qty ${line.quantity} @ ${line.unitPrice} = ${fmt(line.printedAmountCents, currency)} (printed)` },
          ...(subtotal !== null ? [{ source: "commercial_invoice" as const, file: inv?.sourceFile, text: `Goods subtotal ${fmt(subtotal, currency)}` }] : []),
          ...(carried ? [{ source: "commercial_invoice" as const, file: inv?.sourceFile, text: carried }] : []),
        ],
        resolution: computedReconciles
          ? `Entered at ${fmt(computed, currency)}. Ask the seller for a corrected invoice before filing.`
          : "Not changed. Broker must confirm quantity, unit price and amount with the seller.",
        autoApplied: computedReconciles,
      });
    }
    return out;
  },
};
