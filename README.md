# Sefer Entry Prep

Upload a shipment's documents (commercial invoice, packing list, bill of lading or air waybill, as PDFs or images, in any number) and get back:

1. **A NetCHB entry XML** for a CBP Type 01 consumption entry, validated in the app against NetCHB's own published `entry.xsd`.
2. **Findings**: every discrepancy between documents, every value the app changed (with both values and the reason), and every field no document can supply.

The output for the sample shipment is committed: [`output/shipment-001-entry.xml`](output/shipment-001-entry.xml) (XSD-valid) and [`output/shipment-001-findings.json`](output/shipment-001-findings.json).

**Live:** https://sefer-webapp.vercel.app · **Using the website:** [User Manual](docs/USER_MANUAL.md) (step-by-step, with annotated screenshots)

## Run it

```bash
npm install
cp .env.example .env.local    # add GEMINI_API_KEY or ANTHROPIC_API_KEY
npm run dev                   # http://localhost:3000
```

- **No API key?** Click **Use sample shipment** (or open `/?sample`). It loads the hand-transcribed extraction of the three sample PDFs, and everything after extraction runs normally.
- `npm test` runs 92 Vitest tests: the 11 sample traps, XSD validation, MID rules, the extraction retry loop, Gemini quota/fallback handling, the API routes, 7 shipment variants the app has never seen, regression cases taken from real model output, multi-invoice entries, cross-document checks, the PGA scan, and the audit trail.
- `npx tsx scripts/generate-sample.ts` regenerates the committed sample output.
- `npx tsx scripts/eval-extraction.ts` runs the real model on the sample PDFs and scores it field by field against the fixture. It needs a key.

| Env var | Purpose |
|---|---|
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Either one. If both are set, Gemini is used unless `EXTRACT_PROVIDER=anthropic`. |
| `GEMINI_MODEL` | Optional. Comma-separated models tried in order when one is overloaded, out of daily quota or unavailable. Default: `gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash`. Each has its own free-tier quota (20 requests a day), so the chain gives about 80. |
| `ANTHROPIC_MODEL` | Optional (default set in code). |
| `VERIFY_MODEL` | Optional. A *different* model that re-reads bill, container and document numbers in parallel; disagreements become error findings. Off when unset (see "What it does not do"). |
| `EXTRACT_PASSCODE` | Optional. If set, `/api/extract` requires this code (the UI asks for it); the sample shipment stays open. |

### Deploy

Deploy to Vercel: `npx vercel`. No configuration is needed beyond the environment variable (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`). `next.config.ts` already ships the XSDs and the xmllint WASM binary with the `/api/entry` function.

Platform limits, and how the app handles them:
- **Upload size.** Vercel refuses request bodies over about 4.5 MB. The browser therefore uploads one file per request, in parallel. Any single file over 4.4 MB is refused before upload, with the reason.
- **Time.** `/api/extract` asks for up to 120 s per file (`maxDuration`).
- **Gemini free tier.** The limit is 20 requests per model per day. A used-up model is skipped instantly. When every model is used up, the app says so and when it resets, and the sample shipment keeps working.

## How it works

```
files ──► [1 EXTRACT]   model, one call per file          POST /api/extract
             │          "what does this page say", verbatim, incl. errors,
             │          struck-through values, remarks; Zod-validated, 1 retry
             ▼
          DocumentExtraction[]   (editable in the UI)
             │
             ├─► [2 RECONCILE]  TypeScript, 16 rules, zero model calls   ┐
             │                  → ShipmentFacts + Finding[]              │ POST /api/entry
             └─► [3 MAP + EMIT] TypeScript → NetCHB XML → xmllint (WASM) │ pure function of
                                vs entry.xsd + MissingField[]            ┘ (docs, broker inputs)
```

- **The model never decides anything.** It transcribes. All arithmetic, valuation, origin, party roles and MID construction are TypeScript that can be read and tested. Money is integer cents.
- **Nothing changes silently.** A rule that changes a value emits a finding with `autoApplied: true`, the before and after values, the evidence quoted from the documents, and what the broker must still do.
- **Edits are free.** Correcting a misread number, entering an HTS code or picking the importer of record rebuilds findings and XML through `/api/entry` with no model call.

```
src/lib/extract/        prompt, Zod schema, Gemini + Anthropic providers, retry loop
src/lib/reconcile/      facts.ts (who supplies which field), rules/ (one file per rule), mid.ts
src/lib/netchb/         map.ts (facts → XSD tree), build.ts, validate.ts, codes.ts, brokerInputs.ts
src/lib/pipeline.ts     reconcile → broker inputs → map → XML → validate
src/lib/audit.ts        compliance audit record (pure): model output, manual edits, decisions, XML
schemas/                NetCHB entry.xsd + data_type.xsd, and SOURCE.md: how they were found
fixtures/shipment-001/  sample PDFs + hand-written expected extraction (not model-generated)
```

Adding a rule means one file in `src/lib/reconcile/rules/`, one line in `src/lib/reconcile/index.ts`, and one test.

## Built for the broker's review

- **Split-screen verification.** The source PDF or scan stays beside the findings and entry while you review. Tabs switch between documents. Each document has a **View source** toggle, and every quoted piece of evidence in a finding has a **view** link that opens the document it came from.
- **Partner Government Agency (PGA) early warning.** The `PGA_POSSIBLE` rule reads each line's description, style and material for signs of FDA, FCC, EPA, NHTSA, APHIS, FWS, Lacey Act, CPSC, TTB or ATF territory. Each hit names the agency, the matched word, and the `<…-items>` block in NetCHB's `entry.xsd` where the message set is filed or disclaimed. It is a keyword hint, not a determination: CBP derives PGA requirements from the 10-digit HTS number's PGA flags, and the finding says so. It avoids common apparel false positives (faux fur, "ivory" as a colour, shell jackets) and is silent on the sample shipment, which is correct for adult apparel.
- **Compliance audit trail export.** One click downloads `audit-trail-<entry>.json`, a supporting record for 19 CFR Part 163 recordkeeping (5 years from the date of entry, 19 CFR 163.4). It holds:
  - what the model extracted;
  - every manual edit as `path: extracted → reviewed`;
  - the broker inputs and reconciled facts;
  - the corrections the rules applied (each with its evidence), separated from the issues still open;
  - the exact XML, its XSD result, and the SHA-256 of the schema used;
  - SHA-256 hashes of the source files and the XML.
- **Fix-it guidance, not validator jargon.** When the XML fails the XSD, each error is translated into what is missing and where to fix it (for example "Line NB-T101: no tariff number. Enter its 10-digit HTS under Entry lines"). The raw validator output stays one click away.
- **Reading confidence is visible.** Fields the model marked as hard to read become findings. Numbers printed on two documents are compared: the B/L number on the invoice against the B/L, and invoice numbers on the B/L or packing list against the invoices. A mismatch shows both readings, and the app never picks one.
- **Several invoices per shipment.** Each invoice is checked against its own subtotal and total, and entered as its own `<invoice>`.
- **Graceful degradation.** Each panel has its own React error boundary. If an unusual document breaks one section's rendering, that section shows what failed and offers a retry; the rest of the entry keeps working. Boundaries reset when the entry is rebuilt.

## How NetCHB was tracked down

The brief gave no link. The full trail, with dead ends, is in [`schemas/SOURCE.md`](schemas/SOURCE.md). In short:

1. NetCHB's JBossWS service index at `www.netchb.com/main/services/...` exposed the `EntryUploadService` WSDL: `uploadEntry(username, password, entryXml)`, RPC/literal. The WSDL types the entry as a plain string, so its structure lives elsewhere.
2. Guessed paths under `/xml/` found `https://www.netchb.com/xml/entry/entry.xsd`. Its import pointed to `https://www.netchb.com/xml/data/data_type.xsd`. Both are committed untouched (plus a working copy with the import repointed locally), with SHA-256 hashes.
3. The schema's own annotations then confirmed what had been assumptions: `<transmit/>` is what sends to CBP, and NetCHB computes duty unless `<precalculated/>` is present.

## Safety: this never files anything

- The XML has **no `<transmit/>` tag**. Per `entry.xsd`, uploading it to NetCHB stages the entry for a licensed broker to review and transmit.
- The app has **no NetCHB credentials** and makes no SOAP call.
- It **never computes duty**. NetCHB does that from the tariff numbers.

## What it does not do (and says so)

- **No 10-digit HTS classification.** Invoices carry 6-digit HS. The XML carries the digits exactly as printed (schema-valid, never zero-padded to look real), and every line is flagged for the broker. Reporting units (e.g. DOZ + KG for apparel) follow from the 10-digit number.
- **No Chapter 99 / Section 301 / AD-CVD handling, and no PGA message sets.** Origin is set per line so NetCHB's own remedy logic can work, but the app does not stack trade remedies. PGA is flagged by keyword only. It never files or disclaims agency data; that follows from the 10-digit HTS flags.
- **The audit file is a supporting record, not the entry record itself.** The commercial documents and the filed entry are what 19 CFR 163 requires you to keep; the audit trail explains how this entry was prepared from them.
- **The MID is built from CBP's published rules, not looked up.** Ambiguous addresses (e.g. "Lot C7-C8") are flagged for checking against the broker's NetCHB manufacturer table.
- **The importer of record is proposed, never decided silently.** The buyer is preferred over a 3PL consignee, and the choice is flagged and switchable.
- **Valuation assumes one currency and one set of terms.** Several invoices are each reconciled and entered separately, but if their currency or Incoterm differ, a warning says the first one was used for valuation.
- **The master bill is only verified if you pay for it.** It appears only on the B/L, so no cross-document check can catch a misread. Tested live, a second read by the same model repeated the same dropped digit, so the check is off unless `VERIFY_MODEL` names a different model.
- **Untested against a live NetCHB account.** Passing the XSD is necessary, not sufficient: NetCHB and CBP enforce business rules the schema does not express.
- **Small code tables.** Port codes, countries and package units cover common cases. Anything unknown becomes a finding, not a guess. Schedule K foreign port codes are not mapped.
