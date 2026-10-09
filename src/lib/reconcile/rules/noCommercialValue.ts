import { extend } from "../../util/money";
import { docsOf } from "../facts";
import { ev, lineLabel } from "../helpers";
import type { Finding, Rule } from "../types";

const NCV = /\b(FOC|F\.O\.C|FREE OF CHARGE|NO COMMERCIAL VALUE|NCV|N\.C\.V|SAMPLES?)\b/i;

/** Free/sample lines still go on the entry, with a value for customs purposes. */
export const noCommercialValue: Rule = {
  id: "NO_COMMERCIAL_VALUE",
  description: "Free-of-charge / sample lines must be entered with a declared value, not dropped",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const items = docsOf(docs, "commercial_invoice").flatMap((d) => d.lineItems.map((li) => ({ d, li })));
    for (const line of facts.lines) {
      const src = items.find((x) => (x.li.styleOrSku ?? x.li.lineNo) === line.key);
      const flagged = src?.li.excludedFromTotal || line.notes.some((n) => NCV.test(n)) || NCV.test(line.description);
      if (!flagged) continue;
      line.noCommercialValue = true;
      if (line.amountCents === null && line.quantity !== null && line.unitPrice !== null) {
        line.amountCents = extend(line.quantity, line.unitPrice);
      }
      const hasValue = line.amountCents !== null && line.amountCents > 0;
      out.push({
        id: "NO_COMMERCIAL_VALUE",
        severity: hasValue ? "info" : "error",
        category: "valuation",
        field: `lines[${line.key}].enteredValue`,
        title: `${lineLabel(line)} is free of charge but still has to be entered`,
        detail: hasValue
          ? `The invoice marks this line as no-commercial-value and leaves it out of the invoice total. CBP still requires every article to be declared at a value, so it stays on the entry at the stated customs value.`
          : `This line is marked free of charge and no value for customs purposes is stated anywhere.`,
        evidence: src ? [ev(src.d, [src.li.description, ...src.li.lineNotes].join(" | "))] : [],
        resolution: hasValue
          ? "Kept on the entry at the stated customs value. Broker should confirm the value is reasonable (cost of production is the usual basis for samples)."
          : "Broker must supply a value for customs purposes (typically cost of production).",
        autoApplied: false,
      });
    }
    return out;
  },
};
