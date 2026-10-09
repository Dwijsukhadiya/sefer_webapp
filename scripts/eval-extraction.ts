/**
 * Extraction accuracy check: runs the real model on the sample PDFs and compares the
 * output field-by-field with the hand-transcribed fixture. Then runs reconciliation on
 * the MODEL's output to confirm every known trap is still caught end to end.
 *
 *   GEMINI_API_KEY=... (or ANTHROPIC_API_KEY=...) npx tsx scripts/eval-extraction.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractFile } from "../src/lib/extract/client";
import type { ExtractedDoc } from "../src/lib/extract/schema";
import { reconcile } from "../src/lib/reconcile";
import { shipment001 } from "../fixtures/shipment-001/extraction";

const DIR = join(__dirname, "../fixtures/shipment-001");
const norm = (v: unknown) => (typeof v === "string" ? v.toUpperCase().replace(/[^A-Z0-9.%/]/g, "") : JSON.stringify(v));

// The fields that matter downstream. Free text (notes, descriptions) is checked for presence, not wording.
const SCALARS = ["docType", "documentNumber", "documentDateRaw", "currency", "incoterm", "houseBill", "masterBill"] as const;
const LINE_FIELDS = ["styleOrSku", "hsCode", "quantity", "unitPrice", "amount", "excludedFromTotal", "cartons", "piecesPerCarton", "grossWeightKg", "netWeightKg"] as const;
const TOTALS = ["subtotal", "grandTotal", "totalQuantity", "totalPackages", "grossWeightKg", "netWeightKg"] as const;

let ok = 0, total = 0;
const misses: string[] = [];
const check = (label: string, got: unknown, want: unknown) => {
  if (want === null || want === undefined) return; // only score fields that exist on the page
  total++;
  if (norm(got) === norm(want)) ok++;
  else misses.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

async function main() {
  const extracted: ExtractedDoc[] = [];
  for (const want of shipment001) {
    const base64 = readFileSync(join(DIR, want.sourceFile)).toString("base64");
    const t0 = Date.now();
    const docs = await extractFile({ name: want.sourceFile, mediaType: "application/pdf", base64 });
    console.log(`${want.sourceFile}: ${docs.length} document(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    extracted.push(...docs);
    const got = docs.find((d) => d.docType === want.docType) ?? docs[0];
    for (const f of SCALARS) check(`${want.docType}.${f}`, got[f], want[f]);
    for (const f of TOTALS) check(`${want.docType}.totals.${f}`, got.totals[f], want.totals[f]);
    want.lineItems.forEach((wl, i) => {
      const gl = got.lineItems.find((x) => norm(x.styleOrSku) === norm(wl.styleOrSku)) ?? got.lineItems[i];
      for (const f of LINE_FIELDS) check(`${want.docType}.line${i + 1}.${f}`, gl?.[f], wl[f]);
    });
    check(`${want.docType}.amendments`, got.amendments.length, want.amendments.length);
    check(`${want.docType}.manufacturers`, got.parties.filter((p) => p.role === "manufacturer").length, want.parties.filter((p) => p.role === "manufacturer").length || null);
  }

  console.log(`\nField accuracy: ${ok}/${total} (${((ok / total) * 100).toFixed(1)}%)`);
  misses.forEach((m) => console.log("  MISS " + m));

  if (process.env.EVAL_DUMP) writeFileSync(process.env.EVAL_DUMP, JSON.stringify(extracted, null, 2)); // inspect what the model returned
  const r = reconcile(extracted);
  const ids = new Set(r.findings.map((f) => f.id));
  const traps = ["LINE_EXTENSION_MISMATCH", "QUANTITY_MISMATCH", "ASSIST_DETECTED", "LINE_ORIGIN_DIFFERS", "IMPORTER_OF_RECORD",
    "SELLER_NOT_MANUFACTURER", "DOCUMENT_AMENDED", "GROSS_WEIGHT_MISMATCH", "FIBRE_MISMATCH", "DATE_AMBIGUOUS", "MARKING_ORIGIN_CONFLICT"];
  console.log(`\nEnd-to-end traps caught from model output: ${traps.filter((t) => ids.has(t)).length}/${traps.length}`);
  traps.filter((t) => !ids.has(t)).forEach((t) => console.log("  MISSED " + t));
  console.log(`Entered value: ${(r.facts.enteredValueCents ?? 0) / 100} (fixture: 27439)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
