import { docsOf, normKey } from "../facts";
import { ev, lineLabel } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * Invoice vs packing list, matched per style/SKU, never on grand totals. Two documents
 * can agree on the total while disagreeing on a line (one includes samples, one does not).
 */
export const quantityByStyle: Rule = {
  id: "QUANTITY_MISMATCH",
  description: "Per-style quantity: invoice vs packing list",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const inv = docsOf(docs, "commercial_invoice")[0];
    const pl = docsOf(docs, "packing_list")[0];
    if (!inv || !pl) return out;
    let mismatches = 0;

    for (const line of facts.lines) {
      const p = pl.lineItems.find((x) => normKey(x.styleOrSku) && normKey(x.styleOrSku) === normKey(line.sku));
      if (!p) {
        out.push({
          id: "LINE_NOT_ON_PACKING_LIST", severity: "warning", category: "quantity", field: `lines[${line.key}]`,
          title: `${lineLabel(line)} is on the invoice but not found on the packing list`,
          detail: "Could be a different style code on the packing list, or goods not shipped.",
          evidence: [ev(inv, `${line.sku}: ${line.description}`)],
          resolution: "Broker should confirm the goods were actually shipped.", autoApplied: false,
        });
        continue;
      }
      if (line.quantity !== null && p.quantity !== null && line.quantity !== p.quantity) {
        mismatches++;
        const diff = line.quantity - p.quantity;
        out.push({
          id: "QUANTITY_MISMATCH", severity: "error", category: "quantity", field: `lines[${line.key}].quantity`,
          title: `${lineLabel(line)}: invoice says ${line.quantity}, packing list says ${p.quantity}`,
          detail:
            `A difference of ${Math.abs(diff)} ${line.uom ?? "units"}.` +
            (p.cartons && p.piecesPerCarton ? ` The packing list's own math (${p.cartons} cartons × ${p.piecesPerCarton}) gives ${p.cartons * p.piecesPerCarton}.` : "") +
            ` CBP requires the quantity actually imported. If fewer were shipped, the buyer may also be over-invoiced.`,
          evidence: [ev(inv, `${line.sku} qty ${line.quantity}`), ev(pl, `${p.styleOrSku} ${p.cartons ?? "?"} ctns × ${p.piecesPerCarton ?? "?"} = ${p.quantity}`)],
          resolution: `Entered at the invoice quantity (${line.quantity}) pending confirmation. Broker must confirm the shipped count with the shipper; if ${p.quantity}, the value must be adjusted.`,
          autoApplied: false,
        });
      }
    }

    for (const p of pl.lineItems) {
      if (!facts.lines.some((l) => normKey(l.sku) && normKey(l.sku) === normKey(p.styleOrSku))) {
        out.push({
          id: "LINE_NOT_ON_INVOICE", severity: "error", category: "quantity", field: "lines",
          title: `Packing list style ${p.styleOrSku ?? p.description} is not on the invoice`,
          detail: "Goods physically in the shipment must be declared even if they were not invoiced.",
          evidence: [ev(pl, `${p.styleOrSku}: ${p.description} qty ${p.quantity}`)],
          resolution: "Broker must add a line with a value for customs purposes.", autoApplied: false,
        });
      }
    }

    // Matching totals can hide line-level disagreements. Say so explicitly.
    if (mismatches > 0 && inv.totals.totalQuantity !== null && inv.totals.totalQuantity === pl.totals.totalQuantity) {
      out.push({
        id: "TOTALS_MASK_LINE_MISMATCH", severity: "warning", category: "quantity", field: "totals.quantity",
        title: `Both documents total ${inv.totals.totalQuantity} pieces, but they are not counting the same things`,
        detail: "Grand totals agree while individual lines do not, so a total-level check alone would have passed. Check whether one document includes free samples and the other does not.",
        evidence: [ev(inv, `Total quantity ${inv.totals.totalQuantity}`), ev(pl, `Grand total ${pl.totals.totalQuantity}`)],
        resolution: "Reconcile line by line (above).", autoApplied: false,
      });
    }
    return out;
  },
};
