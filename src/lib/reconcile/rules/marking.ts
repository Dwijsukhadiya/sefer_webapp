import { originMentionedIn } from "../../util/countries";
import { ev, lineLabel } from "../helpers";
import type { Finding, Rule } from "../types";

/** Shipping marks claiming one origin while some goods are from another (19 CFR 134). */
export const marking: Rule = {
  id: "MARKING_ORIGIN_CONFLICT",
  description: "Origin in carton marks vs per-line origin",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    for (const d of docs) {
      const mark = d.shippingMarks.find((m) => originMentionedIn(m));
      if (!mark) continue;
      const markedIso = originMentionedIn(mark);
      const conflicting = facts.lines.filter((l) => l.originIso && l.originIso !== markedIso);
      if (!conflicting.length) continue;
      out.push({
        id: "MARKING_ORIGIN_CONFLICT",
        severity: "warning",
        category: "marking",
        field: "marking",
        title: `Cartons are marked "${mark}" but ${conflicting.map(lineLabel).join(", ")} originates in ${conflicting[0].originIso}`,
        detail: "Containers must be marked with the true country of origin of their contents. Mis-marked cartons can be held for re-marking and incur marking duties (19 CFR 134).",
        evidence: [ev(d, `Shipping marks: ${d.shippingMarks.join(" / ")}`)],
        resolution: "Broker should alert the importer; the affected cartons may need re-marking before release.",
        autoApplied: false,
      });
      break;
    }
    return out;
  },
};
