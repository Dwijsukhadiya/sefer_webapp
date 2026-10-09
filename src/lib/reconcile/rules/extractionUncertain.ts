import { READS_DISAGREE, SECOND_READ_FAILED } from "../../extract/verify";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

const DOC: Record<string, string> = {
  commercial_invoice: "Invoice", packing_list: "Packing list", bill_of_lading: "Bill of lading", air_waybill: "Air waybill", other: "Document",
};

/**
 * Values the reader was not sure of: fields the model itself flagged (smudged, stamped over),
 * and identifiers where two independent reads disagree. A person checks these against the
 * page; the code never picks one.
 */
export const extractionUncertain: Rule = {
  id: "EXTRACTION_UNCERTAIN",
  description: "Fields the extraction could not read confidently",
  run: ({ docs }) => {
    const out: Finding[] = [];
    for (const d of docs) {
      for (const u of d.uncertain) {
        const conflict = u.reason.startsWith(READS_DISAGREE) || u.reason.startsWith(SECOND_READ_FAILED);
        out.push({
          id: "EXTRACTION_UNCERTAIN",
          severity: conflict ? "error" : "warning",
          category: "completeness",
          field: `${d.docType}.${u.field}`,
          title: `${DOC[d.docType] ?? "Document"} ${d.documentNumber ?? d.sourceFile}: ${u.field} ${conflict ? "needs checking" : "was hard to read"}`,
          detail: u.reason,
          evidence: [ev(d, `${u.field}: ${u.reason}`)],
          resolution: "Compare with the source document (View source) and correct the value under Extracted documents if needed.",
          autoApplied: false,
        });
      }
    }
    return out;
  },
};
