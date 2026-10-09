// Prints every finding for the sample shipment. Run: npx tsx scripts/dump-findings.ts
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { reconcile } from "../src/lib/reconcile";
const r = reconcile(structuredClone(shipment001));
for (const f of r.findings) console.log(`[${f.severity}]${f.autoApplied ? "[auto]" : ""} ${f.id}: ${f.title}`);
for (const l of r.facts.lines) console.log(`${l.sku} qty=${l.quantity} amt=${l.amountCents} entered=${l.enteredValueCents} origin=${l.originIso} mfr=${l.manufacturerKey}`);
