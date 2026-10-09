/**
 * The deterministic half of the app: extractions + broker inputs → facts, findings, XML.
 * No model calls. POST /api/entry is a thin wrapper around this.
 */
import type { ExtractedDoc } from "./extract/schema";
import { applyBrokerInputs, missingFields, type BrokerInputs, type MissingField } from "./netchb/brokerInputs";
import { buildXml } from "./netchb/build";
import { mapEntry } from "./netchb/map";
import { validateEntryXml, type XsdResult } from "./netchb/validate";
import { reconcile } from "./reconcile";
import type { Finding, ShipmentFacts } from "./reconcile/types";

export interface EntryResult {
  facts: ShipmentFacts;
  findings: Finding[];
  missing: MissingField[];
  xml: string;
  xsd: XsdResult;
}

export async function buildEntry(docs: ExtractedDoc[], broker: BrokerInputs): Promise<EntryResult> {
  const { facts: reconciled, findings } = reconcile(structuredClone(docs));
  const facts = applyBrokerInputs(reconciled, broker);
  const { tree, notes } = mapEntry(facts, broker);
  const xml = buildXml(tree);
  const xsd = await validateEntryXml(xml);
  return { facts, findings: [...findings, ...notes], missing: missingFields(facts, broker), xml, xsd };
}
