import type { ExtractedDoc } from "../extract/schema";
import { buildFacts } from "./facts";
import { assists } from "./rules/assists";
import { customsValue } from "./rules/customsValue";
import { dates } from "./rules/dates";
import { fibreContent } from "./rules/fibreContent";
import { htsClassification } from "./rules/htsClassification";
import { invoiceTotals } from "./rules/invoiceTotals";
import { lineArithmetic } from "./rules/lineArithmetic";
import { lineOrigin } from "./rules/lineOrigin";
import { marking } from "./rules/marking";
import { noCommercialValue } from "./rules/noCommercialValue";
import { packagesAndWeight } from "./rules/packagesAndWeight";
import { packingMath } from "./rules/packingMath";
import { parties } from "./rules/parties";
import { quantityByStyle } from "./rules/quantityByStyle";
import { transport } from "./rules/transport";
import type { Finding, Rule, ShipmentFacts } from "./types";

/**
 * Rules run IN THIS ORDER over a shared draft of the facts. Order matters only where a
 * rule depends on another's output (e.g. customsValue needs corrected amounts and
 * assists). To add a rule: write one file in rules/, add it here, add a test.
 */
export const RULES: Rule[] = [
  noCommercialValue, // marks FOC lines before arithmetic so they're excluded from totals
  lineArithmetic,
  invoiceTotals,
  quantityByStyle,
  packingMath,
  packagesAndWeight,
  lineOrigin, // before parties/marking: assigns per-line origin + manufacturer
  assists,
  customsValue, // after arithmetic + assists
  fibreContent,
  htsClassification,
  parties,
  transport,
  dates,
  marking,
];

const RANK = { error: 0, warning: 1, info: 2 } as const;

export interface ReconcileResult {
  facts: ShipmentFacts;
  findings: Finding[];
}

export function reconcile(docs: ExtractedDoc[]): ReconcileResult {
  const facts = buildFacts(docs);
  const findings: Finding[] = [];
  for (const rule of RULES) {
    try {
      findings.push(...rule.run({ docs, facts }));
    } catch (e) {
      // A broken rule must never take down the whole entry; surface it instead.
      findings.push({
        id: "RULE_FAILED", severity: "warning", category: "completeness", field: rule.id,
        title: `Check "${rule.description}" could not run`, detail: String(e),
        evidence: [], resolution: "Review this area manually.", autoApplied: false,
      });
    }
  }
  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { facts, findings };
}
