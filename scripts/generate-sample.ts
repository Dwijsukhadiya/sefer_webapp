// Writes output/shipment-001-entry.xml (+ findings JSON) from the hand-transcribed fixture.
// Run: npx tsx scripts/generate-sample.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { emptyBrokerInputs } from "../src/lib/netchb/brokerInputs";
import { buildEntry } from "../src/lib/pipeline";

buildEntry(shipment001, emptyBrokerInputs()).then((r) => {
  mkdirSync("output", { recursive: true });
  writeFileSync("output/shipment-001-entry.xml", r.xml);
  writeFileSync("output/shipment-001-findings.json", JSON.stringify({ xsd: r.xsd, missing: r.missing, findings: r.findings }, null, 2));
  console.log(r.xml);
  console.log(`XSD valid: ${r.xsd.valid}`);
  r.xsd.errors.forEach((e) => console.log("  " + e));
  console.log(`${r.findings.length} findings, ${r.missing.length} missing fields`);
});
