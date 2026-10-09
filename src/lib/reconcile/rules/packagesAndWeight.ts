import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

/** Package count and gross weight: packing list vs transport document. */
export const packagesAndWeight: Rule = {
  id: "PACKAGES_WEIGHT",
  description: "Package count and gross weight across documents",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const pl = docsOf(docs, "packing_list")[0];
    const tr = docsOf(docs, "bill_of_lading", "air_waybill")[0];
    if (!pl || !tr) return out;

    const a = pl.totals.totalPackages, b = tr.totals.totalPackages;
    if (a !== null && b !== null && a !== b) {
      out.push({
        id: "PACKAGE_COUNT_MISMATCH", severity: "error", category: "transport", field: "packages",
        title: `Packing list shows ${a} packages, transport document shows ${b}`,
        detail: "The manifest quantity on the entry must match the bill of lading or CBP will reject it at cargo release.",
        evidence: [ev(pl, `${a} ${pl.totals.packageType ?? ""}`), ev(tr, `${b} ${tr.totals.packageType ?? ""}`)],
        resolution: `Entered ${b} (matches the manifest). Broker should confirm the physical count.`, autoApplied: false,
      });
    }

    const g1 = pl.totals.grossWeightKg, g2 = tr.totals.grossWeightKg;
    if (g1 !== null && g2 !== null && Math.abs(g1 - g2) > 0.5) {
      const pct = (Math.abs(g1 - g2) / Math.max(g1, g2)) * 100;
      facts.grossKg = g2;
      out.push({
        id: "GROSS_WEIGHT_MISMATCH", severity: pct > 5 ? "error" : "warning", category: "transport", field: "grossKg",
        title: `Gross weight differs: ${g1} kg (packing list) vs ${g2} kg (transport document)`,
        detail: `A gap of ${(g2 - g1).toFixed(2)} kg (${pct.toFixed(1)}%). Pallets or dunnage counted by the carrier are a common cause${/palleti[sz]ed:\s*no/i.test(pl.notes.join(" ")) ? ", but the packing list says the cartons were not palletized" : ""}.`,
        evidence: [ev(pl, `Total G.W. ${g1} kg`), ev(tr, `Gross weight ${g2} kg`)],
        resolution: `Using ${g2} kg from the transport document, which is what the manifest carries. Broker should confirm.`,
        autoApplied: false,
      });
    }
    return out;
  },
};
