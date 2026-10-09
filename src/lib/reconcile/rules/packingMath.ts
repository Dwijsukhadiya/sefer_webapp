import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

/** The packing list must agree with itself: cartons × pcs/carton, and line weights vs totals. */
export const packingMath: Rule = {
  id: "PACKING_LIST_MATH",
  description: "Packing list internal arithmetic",
  run: ({ docs }) => {
    const out: Finding[] = [];
    for (const pl of docsOf(docs, "packing_list")) {
      for (const li of pl.lineItems) {
        if (li.cartons !== null && li.piecesPerCarton !== null && li.quantity !== null && li.cartons * li.piecesPerCarton !== li.quantity) {
          out.push({
            id: "PACKING_LIST_MATH", severity: "warning", category: "quantity", field: `packingList.${li.styleOrSku}`,
            title: `Packing list ${li.styleOrSku}: ${li.cartons} × ${li.piecesPerCarton} ≠ ${li.quantity}`,
            detail: "Carton count times pieces per carton does not match the line total.",
            evidence: [ev(pl, `${li.cartons} ctns × ${li.piecesPerCarton} = ${li.quantity}`)],
            resolution: "Broker should confirm the physical count.", autoApplied: false,
          });
        }
      }
      const sumOf = (k: "cartons" | "quantity" | "grossWeightKg" | "netWeightKg") =>
        pl.lineItems.every((l) => l[k] !== null) ? pl.lineItems.reduce((a, l) => a + (l[k] as number), 0) : null;
      const checks: Array<[string, number | null, number | null]> = [
        ["cartons", sumOf("cartons"), pl.totals.totalPackages],
        ["pieces", sumOf("quantity"), pl.totals.totalQuantity],
        ["gross weight (kg)", sumOf("grossWeightKg"), pl.totals.grossWeightKg],
        ["net weight (kg)", sumOf("netWeightKg"), pl.totals.netWeightKg],
      ];
      for (const [label, s, total] of checks) {
        if (s !== null && total !== null && !near(s, total)) {
          out.push({
            id: "PACKING_LIST_TOTALS", severity: "warning", category: "quantity", field: `packingList.totals`,
            title: `Packing list ${label}: lines sum to ${+s.toFixed(3)} but the total says ${total}`,
            detail: "The packing list's grand total does not match its own lines.",
            evidence: [ev(pl, `Total ${label} ${total}`)],
            resolution: "Broker should confirm with the shipper.", autoApplied: false,
          });
        }
      }
    }
    return out;
  },
};
