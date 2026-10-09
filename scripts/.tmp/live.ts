// Temporary post-deploy check: live /api/entry must equal the local pipeline, plus API edge cases.
import { billOfLading, invoice, packingList, shipment001 } from "../../fixtures/shipment-001/extraction";
import type { ExtractedDoc } from "../../src/lib/extract/schema";
import { emptyBrokerInputs } from "../../src/lib/netchb/brokerInputs";
import { buildEntry } from "../../src/lib/pipeline";

const U = "https://sefer-webapp.vercel.app";
const c = <T,>(x: T): T => structuredClone(x);
const clean = () => { const i = c(invoice); i.lineItems = i.lineItems.slice(0, 3); i.lineItems[0].amount = 6840; i.notes = i.notes.filter((n) => !/W-B220|Item 5/.test(n)); i.totals.subtotal = 21975; i.totals.grandTotal = 26010; return i; };
const cases: Array<[string, ExtractedDoc[]]> = [["sample", c(shipment001)], ["invoice only", [clean()]]];
{ const i = clean(); i.lineItems.forEach((l) => (l.hsCode = null)); cases.push(["no HS codes", [i, c(billOfLading)]]); }
{ const a = clean(); const b = c(a); b.documentNumber = "KBAS/NB/26-0913"; b.lineItems = [{ ...a.lineItems[0], styleOrSku: "NB-T102", lineNo: "1" }]; b.charges = []; b.totals.subtotal = 6840; b.totals.grandTotal = 6840; cases.push(["two invoices", [a, b, c(billOfLading)]]); }
{ const bl = c(billOfLading); bl.houseBill = "BMLVHCM2609418"; cases.push(["misread house bill", [c(invoice), c(packingList), bl]]); }
{ const i = c(invoice); i.lineItems[0].description = "BLUETOOTH WIRELESS SPEAKER"; cases.push(["PGA goods", [i, c(packingList), c(billOfLading)]]); }

(async () => {
  let pass = 0;
  for (const [name, docs] of cases) {
    const local = await buildEntry(c(docs), emptyBrokerInputs());
    const res = await fetch(`${U}/api/entry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documents: docs }) });
    const live = await res.json();
    const ids = (r: { findings: { id: string }[] }) => r.findings.map((f) => f.id).sort().join(",");
    const ok = res.status === 200 && live.xml === local.xml && ids(live) === ids(local) && JSON.stringify(live.xsdIssues) === JSON.stringify(local.xsdIssues);
    if (ok) pass++;
    const notable = [...new Set(live.findings.filter((f: { severity: string; category: string }) => f.severity === "error" && f.category !== "filing").map((f: { id: string }) => f.id))].join(" ");
    console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(20)} xsd:${live.xsd.valid ? "valid" : "invalid"} errors:[${notable}]${live.xsdIssues?.length ? `\n      fix-it: ${live.xsdIssues.map((x: { message: string }) => x.message).join(" | ")}` : ""}`);
  }
  console.log(`${pass}/${cases.length} identical to local\n`);
  const probe = async (label: string, init: RequestInit, path: string) => { const r = await fetch(U + path, init); console.log(`${label.padEnd(34)} ${r.status} ${(await r.text()).slice(0, 110)}`); };
  await probe("entry: malformed JSON", { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }, "/api/entry");
  await probe("extract: JSON instead of a form", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, "/api/extract");
  await probe("extract: no body", { method: "POST" }, "/api/extract");
  await probe("extract: form without files", { method: "POST", body: (() => { const f = new FormData(); f.append("x", "1"); return f; })() }, "/api/extract");
})();
