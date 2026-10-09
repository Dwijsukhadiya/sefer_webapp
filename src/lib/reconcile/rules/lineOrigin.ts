import { originMentionedIn } from "../../util/countries";
import { allNotes, ev, lineLabel, linesReferencedBy } from "../helpers";
import type { Evidence, Finding, Rule } from "../types";

/**
 * Country of origin is per line. A line-level remark ("Origin: Bangladesh", "Made in
 * Bangladesh") overrides the shipment-level statement, and the line then needs the
 * manufacturer in THAT country for its MID.
 */
export const lineOrigin: Rule = {
  id: "LINE_ORIGIN_DIFFERS",
  description: "Per-line country of origin from line notes and remarks",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const notes = allNotes(docs);

    for (const line of facts.lines) {
      const evidence: Evidence[] = [];
      let found: string | null = null;
      for (const n of line.notes) {
        const iso = originMentionedIn(n);
        if (iso) { found = iso; evidence.push({ source: "commercial_invoice", text: n }); }
      }
      for (const n of notes) {
        if (!linesReferencedBy(n.text, [line]).length) continue;
        const iso = originMentionedIn(n.text);
        if (iso) { found = found ?? iso; evidence.push(ev(n.doc, n.text)); }
      }
      if (!found || found === line.originIso) continue;

      const previous = line.originIso;
      line.originIso = found;
      line.originSource = "line-level remark";
      const mfr = facts.manufacturers.find((m) => m.countryIso === found);
      line.manufacturerKey = mfr?.key ?? null;

      const declaration = notes.find((n) => /certify|declar/i.test(n.text) && /origin/i.test(n.text));
      out.push({
        id: "LINE_ORIGIN_DIFFERS",
        severity: "error",
        category: "origin",
        field: `lines[${line.key}].countryOfOrigin`,
        title: `${lineLabel(line)} is made in ${found}, not ${previous ?? "the stated shipment origin"}`,
        detail:
          `The shipment is declared as ${previous ?? "unknown"} origin, but this line's own remarks say ${found}. ` +
          `Origin drives duty rates, trade-remedy tariffs and quota, so this line is entered separately with its own origin` +
          (mfr ? ` and manufacturer (${mfr.name}, MID ${mfr.mid ?? "unknown"}).` : `. No manufacturer in ${found} is identified on the documents.`) +
          (declaration ? " The invoice declaration certifying single-country origin is therefore inaccurate." : ""),
        evidence: declaration ? [...evidence, ev(declaration.doc, declaration.text)] : evidence,
        resolution: mfr
          ? `Line entered with origin ${found} and manufacturer ${mfr.name}. Ask the seller to correct the origin declaration.`
          : `Line entered with origin ${found}. Broker must obtain the ${found} manufacturer's name and address for the MID.`,
        autoApplied: true,
      });
    }
    return out;
  },
};
