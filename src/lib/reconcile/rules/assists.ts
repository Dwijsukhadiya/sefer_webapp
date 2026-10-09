import { fmt, toCents } from "../../util/money";
import { allNotes, ev, lineLabel, linesReferencedBy, moneyIn } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * Assists (19 U.S.C. 1401a(h)): materials, tooling, dies or design work the BUYER
 * supplied free or at reduced cost for producing the goods. Their value is added to
 * the transaction value. Classic signal: a "CMT" price plus buyer-supplied fabric.
 */
const ASSIST_SIGNAL =
  /\b(CMT|cut[, ]*make\s*(&|and)\s*trim|buyer[- ]?supplied|supplied (free of charge )?by (the )?buyer|buyer'?s? (fabric|material|tooling|moulds?|molds?)|free of charge by buyer|consigned (fabric|material)|tooling|moulds?|molds?|dies)\b/i;

export const assists: Rule = {
  id: "ASSIST_DETECTED",
  description: "Detect buyer-supplied materials and add them to dutiable value",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const notes = allNotes(docs).filter((n) => ASSIST_SIGNAL.test(n.text));
    const handled = new Set<string>();

    for (const n of notes) {
      const lines = linesReferencedBy(n.text, facts.lines);
      const values = moneyIn(n.text);
      // A note naming a line and a value is an assist statement; a bare "CMT price" line note is a signal.
      for (const line of lines.length ? lines : []) {
        if (handled.has(line.key)) continue;
        if (values.length) {
          handled.add(line.key);
          const assist = toCents(Math.max(...values));
          line.assistCents += assist;
          facts.assistsCents += assist;
          const support = allNotes(docs).filter((x) => x !== n && linesReferencedBy(x.text, [line]).length && ASSIST_SIGNAL.test(x.text));
          out.push({
            id: "ASSIST_DETECTED", severity: "error", category: "valuation",
            field: `lines[${line.key}].assist`,
            title: `${lineLabel(line)}: buyer-supplied material is an assist, so ${fmt(assist, facts.currency ?? "USD")} is added to dutiable value`,
            detail:
              `The price covers only part of the cost of making these goods; the buyer supplied the rest for free. ` +
              `Under 19 U.S.C. 1401a(h) that value must be added to the transaction value. ` +
              `Declared ${fmt(line.amountCents ?? 0, facts.currency ?? "USD")} + assist ${fmt(assist, facts.currency ?? "USD")} = ${fmt((line.amountCents ?? 0) + assist, facts.currency ?? "USD")}.`,
            evidence: [ev(n.doc, n.text), ...support.map((s) => ev(s.doc, s.text))],
            resolution: "Added to the line's entered value. Broker should confirm the assist value (and any freight to deliver the fabric to the factory, which is also part of it).",
            autoApplied: true,
          });
        }
      }
    }

    // Signal without a value: we know there is an assist but not how much.
    for (const n of notes) {
      for (const line of linesReferencedBy(n.text, facts.lines)) {
        if (handled.has(line.key)) continue;
        handled.add(line.key);
        out.push({
          id: "ASSIST_VALUE_MISSING", severity: "error", category: "valuation", field: `lines[${line.key}].assist`,
          title: `${lineLabel(line)}: likely assist, but no value stated`,
          detail: "The documents indicate the buyer supplied materials or tooling, but give no value. Assists must be added to dutiable value.",
          evidence: [ev(n.doc, n.text)],
          resolution: "Broker must obtain the assist value from the importer.", autoApplied: false,
        });
      }
    }
    for (const line of facts.lines) {
      if (handled.has(line.key)) continue;
      const sig = line.notes.find((t) => ASSIST_SIGNAL.test(t));
      if (sig) {
        out.push({
          id: "ASSIST_VALUE_MISSING", severity: "error", category: "valuation", field: `lines[${line.key}].assist`,
          title: `${lineLabel(line)}: "${sig}" suggests an assist, but no value is stated`,
          detail: "CMT pricing usually means the buyer supplied materials, which must be added to dutiable value.",
          evidence: [{ source: "commercial_invoice", text: sig }],
          resolution: "Broker must obtain the assist value from the importer.", autoApplied: false,
        });
      }
    }
    return out;
  },
};
