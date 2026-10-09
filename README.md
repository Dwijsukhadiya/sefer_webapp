# Sefer Entry Prep

Upload a shipment's documents (commercial invoice, packing list, bill of lading or air waybill, as PDFs or images, in any number) and get back:

1. **A NetCHB entry XML** for a CBP Type 01 consumption entry, validated in the app against NetCHB's own published `entry.xsd`.
2. **Findings**: every discrepancy between documents, every value the app changed (with both values and the reason), and every field no document can supply.

The output for the sample shipment is committed: [`output/shipment-001-entry.xml`](output/shipment-001-entry.xml) (XSD-valid) and [`output/shipment-001-findings.json`](output/shipment-001-findings.json).

## Run it

```bash
npm install
cp .env.example .env.local    # add GEMINI_API_KEY or ANTHROPIC_API_KEY
npm run dev                   # http://localhost:3000
```

- **No API key?** Click **Use sample shipment** (or open `/?sample`). It loads the hand-transcribed extraction of the three sample PDFs, and everything after extraction runs normally.
- `npm test` runs 50 Vitest tests: the 11 sample traps, XSD validation, MID rules, the extraction retry loop, 7 shipment variants the app has never seen, and regression cases taken from real model output.
- `npx tsx scripts/generate-sample.ts` regenerates the committed sample output.
- `npx tsx scripts/eval-extraction.ts` runs the real model on the sample PDFs and scores it field by field against the fixture. It needs a key.

| Env var | Purpose |
|---|---|
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Either one. If both are set, Gemini is used unless `EXTRACT_PROVIDER=anthropic`. |
| `GEMINI_MODEL`, `ANTHROPIC_MODEL` | Optional model override (defaults: `gemini-3.8-flash`, `claude-sonnet-5-5`). |

### Deploy

Deploy to Vercel: `npx vercel`. No configuration is needed beyond the environment variable (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`). `next.config.ts` already ships the XSDs and the xmllint WASM binary with the `/api/entry` function.

Two platform limits to know about:
- Vercel caps a function's request body at about 4.5 MB, so very large scans should be compressed or uploaded one file at a time.
- `/api/extract` asks for up to 120 s (`maxDuration`), which needs a plan that allows it.

The sample shipment's PDFs (~470 KB total) are well within both limits.

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
schemas/                NetCHB entry.xsd + data_type.xsd, and SOURCE.md: how they were found
fixtures/shipment-001/  sample PDFs + hand-written expected extraction (not model-generated)
```

Adding a rule means one file in `src/lib/reconcile/rules/`, one line in `src/lib/reconcile/index.ts`, and one test.

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
- **No Chapter 99 / Section 301 / AD-CVD / PGA handling.** Origin is set per line so NetCHB's own remedy logic can work, but the app does not stack trade remedies.
- **The MID is built from CBP's published rules, not looked up.** Ambiguous addresses (e.g. "Lot C7-C8") are flagged for checking against the broker's NetCHB manufacturer table.
- **The importer of record is proposed, never decided silently.** The buyer is preferred over a 3PL consignee, and the choice is flagged and switchable.
- **One `<invoice>` per entry.** With several invoices, lines are merged and a warning says so.
- **Untested against a live NetCHB account.** Passing the XSD is necessary, not sufficient: NetCHB and CBP enforce business rules the schema does not express.
- **Small code tables.** Port codes, countries and package units cover common cases. Anything unknown becomes a finding, not a guess. Schedule K foreign port codes are not mapped.
