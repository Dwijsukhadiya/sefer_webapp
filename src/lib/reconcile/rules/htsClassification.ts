import { lineLabel } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * CBP needs a 10-digit HTSUS number. Invoices usually carry 6-digit HS (international).
 * We never invent the last four digits; we say exactly what is known.
 */
export const htsClassification: Rule = {
  id: "HTS_INCOMPLETE",
  description: "Every line needs a 10-digit HTSUS number",
  run: ({ facts }) => {
    const out: Finding[] = [];
    for (const line of facts.lines) {
      if (line.htsNumber) continue;
      const digits = (line.hsAsPrinted ?? "").replace(/\D/g, "");
      out.push({
        id: digits ? "HTS_INCOMPLETE" : "HTS_MISSING",
        severity: digits ? "warning" : "error",
        category: "classification",
        field: `lines[${line.key}].hts`,
        title: digits
          ? `${lineLabel(line)}: only a ${digits.length}-digit HS code (${line.hsAsPrinted}) is given`
          : `${lineLabel(line)}: no tariff code on any document`,
        detail: digits
          ? `The first 6 digits are international and fix the heading. The US 8-digit subheading and 2-digit statistical suffix depend on details like gender, knit vs woven, fibre content and garment features, and they set the duty rate. Description: ${line.description}${line.fibre ? `, ${line.fibre}` : ""}${line.construction ? `, ${line.construction}` : ""}.`
          : "A tariff number must be assigned by the broker.",
        evidence: line.hsAsPrinted ? [{ source: "commercial_invoice", text: `HS ${line.hsAsPrinted}` }] : [],
        resolution: digits
          ? `The XML carries the ${digits.length} digits exactly as printed (never zero-padded, which would look like a real classification). Broker must classify to 10 digits (hts.usitc.gov, heading ${digits.slice(0, 4)}) and check Chapter 99 additional duties for origin ${line.originIso ?? "?"}.`
          : "Broker must classify.",
        autoApplied: false,
      });
    }
    return out;
  },
};
