# CLAUDE.md — Sefer Entry Prep

Context file for AI assistants working in this repo. Read this first, then PLAN.md for phases and status.

## What this project is

A TypeScript web app (Next.js) for the Sefer SWE intern take-home. A user uploads a shipment's documents (commercial invoice, packing list, bill of lading) and gets back:

1. A **NetCHB entry XML** (CBP Type 01 consumption entry), validated against NetCHB's published XSD.
2. A **findings list**: discrepancies between documents, values we corrected and why, and fields no document can supply.

It must work for shipments we have never seen. The sample shipment is a test fixture, not the spec.

## Domain primer (keep this straight)

- **Entry / 7501**: the filing a licensed customs broker sends to CBP describing imported goods. NetCHB is ABI software that brokers use to transmit it to CBP's ACE system.
- **NetCHB** (now Descartes NetCHB) accepts entries over a SOAP web service: `uploadEntry(username, password, entryXml)` (live WSDL in `schemas/`). Schema: `entry.xsd` + `data_type.xsd`, downloaded from netchb.com on 9 Oct 2026. **Confirmed from the XSD annotations:** omitting `<transmit/>` stages the entry without sending it to CBP; NetCHB calculates duty unless `<precalculated/>` is present. We never emit either tag.
- **Importer of record (IOR)**: the party liable for the entry. Usually the buyer, not necessarily the B/L consignee (a consignee can be a 3PL warehouse).
- **Manufacturer vs seller**: the MID (Manufacturer ID) is built from the **manufacturer's** name/address/city, never from a trading or sourcing intermediary.
- **Customs value**: transaction value. For CIF/CFR/CIP/CPT terms, separately stated international freight and insurance are removed. **Assists** (materials the buyer supplied free or cheaply for production) are **added**.
- **HTS**: CBP needs 10-digit HTSUS. Invoices often show 6-digit HS. Never present a guessed 10-digit code as certain.
- **Country of origin is per line**, not per shipment.
- **FOC / sample / NCV lines** still go on the entry with a declared value.
- **House vs master B/L**: an NVOCC house bill rides on a carrier master bill. Each has its own SCAC.

## Architecture rule (most important)

```
PDFs → [EXTRACT: LLM]  → DocumentExtraction[]   per document, no cross-doc reasoning
     → [RECONCILE: TS] → ShipmentFacts + Finding[]   zero LLM calls
     → [MAP+EMIT: TS]  → NetCHB XML + MissingField[] zero LLM calls
```

- The LLM only answers "what does this document say". It never does arithmetic, valuation, origin, party resolution, or compliance logic.
- Every number that matters is recomputed in TypeScript.
- `POST /api/entry` is a pure function of `(extractions, brokerInputs)`. UI edits rebuild XML with no model call.
- Nothing is silently corrected. Any changed value produces a `Finding` with `autoApplied: true`, showing both values and the reason.
- Every extracted field carries `source`, `confidence`, and a short `evidence` snippet.

## Code conventions

- TypeScript strict. No `any` in `lib/`.
- Zod schemas are the source of truth for extraction shapes; infer TS types from them.
- One reconciliation rule per file in `src/lib/reconcile/rules/`, each a pure function `(facts) => Finding[]`, each with a Vitest test. Adding a rule = one file + one registry line + one test.
- Rules are written against document semantics, never against the sample invoice's layout or values.
- Money: work in integer cents or a decimal helper. No float accumulation in totals.
- Keep dependencies few. Every package must be explainable on the walkthrough call.
- Small, readable modules over clever ones. There is a live code change on the review call.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run build
```

Env: `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` (see `.env.example`). Without a key, `/?sample` loads the hand-transcribed fixture.

```bash
npx tsx scripts/generate-sample.ts   # regenerate output/shipment-001-entry.xml
npx tsx scripts/eval-extraction.ts   # real model vs fixture (needs a key)
```

## Key paths

- `schemas/` NetCHB XSDs + `SOURCE.md` (provenance: where and how each file was found)
- `fixtures/shipment-001/` sample PDFs + hand-written expected extraction and findings (never model-generated)
- `src/lib/extract/` LLM extraction (`providers/gemini.ts`, `providers/anthropic.ts`; shared Zod validate + retry in `client.ts`)
- `src/lib/reconcile/` rules engine, valuation, parties, MID
- `src/lib/netchb/` mapping (`map.ts`: every schema compromise emits a `filing` finding), XML build, XSD validation, code lists
- `src/lib/pipeline.ts` the deterministic half: reconcile → broker inputs → map → XML → validate
- `output/shipment-001-entry.xml` generated entry for the sample (deliverable)

## Sample shipment: known traps (regression tests must catch all)

1. Line 1 extension printed 6,480.00; 2,400 × 2.85 = 6,840.00, and only 6,840 reconciles to the 21,975 subtotal.
2. Hoodie NB-H205: invoice 1,200 pcs, packing list 49 × 24 = 1,176. Both docs total "5,100" but the invoice excludes the 24 samples and the packing list includes them. Reconcile per style, never on totals.
3. W-B220 is CMT-priced; buyer-supplied fabric USD 4,180 is an assist. Dutiable 1,260 + 4,180 = 5,440.
4. NB-P118S: 24 FOC samples, USD 1.00/pc for customs, origin **Bangladesh** (Gazipur sister unit), different manufacturer.
5. Seller Kowloon Bay (HK) ≠ manufacturer Saigon Phoenix (VN). MID from Saigon Phoenix.
6. IOR probably Northbound Outfitters (buyer); B/L consignee Cascade Fulfillment is a 3PL. Flag, don't decide silently.
7. CIF 27,270 → FOB 23,235 after removing freight 3,850 and insurance 185.
8. Container OPLU3041728 struck through, OPLU3041722 handwritten. Always surface both as an error-level finding. Auto-pick only when the ISO 6346 check digit proves one impossible (1728's check digit should be 2, so 1722 is used). Decided with the user 9 Oct 2026; the broker can override in the UI.
9. Gross weight 1,888.00 kg (PL) vs 1,930.000 kg (B/L).
10. HS codes are 6-digit; 10-digit HTS needs broker review.
11. House B/L BMLVHCM26090418 (SCAC BMLV) on master OPLUSGN260917735 (SCAC OPLU).

## Integrity

- Another candidate's public repo for this same assignment exists on GitHub. Do not open, read, or borrow from it. Facts about NetCHB must be confirmed from primary sources (NetCHB/Descartes, CBP) and cited in `schemas/SOURCE.md`.
- When unsure, say so in the findings or README. Honesty about unknowns is a graded criterion.
- Save all AI chat history; it is a submission deliverable.
