# PLAN.md — Sefer SWE Intern Take-Home

**Goal:** a TypeScript web app where a user uploads shipment documents (commercial invoice, packing list, bill of lading) and gets back a NetCHB-ready entry XML, plus an explicit list of what's missing, conflicting, or uncertain.

**Deadline:** 48h from receipt. Started Wed 8 Oct 2026, ~18:40 IST → target submission **Fri 10 Oct evening IST**, with buffer.

---

## Status (9 Oct 2026)

| Phase | State |
|---|---|
| 0 Recon | **Done.** WSDL (8 Oct) plus `entry.xsd` and `data_type.xsd` downloaded 9 Oct; see `schemas/SOURCE.md`. Transmit and duty behaviour confirmed from the XSD. |
| 1 Scaffold | Done. Deploy left to the author (Vercel). |
| 2 Extraction | Done: Gemini or Anthropic providers, Zod validation, one retry. Live eval pending an API key. |
| 3 Reconciliation | Done: 16 rules; all 11 sample traps tested. |
| 4 XML + XSD | **Done.** `output/shipment-001-entry.xml` validates against NetCHB's entry.xsd. |
| 5 UI | Done: upload/sample → findings → broker inputs → entry lines → XML → editable extractions. |
| 6 Generalisation | Done: 7 variant tests (EUR/FOB, CIF unitemised, AWB, invoice only, no HS, seller=factory, 2 invoices). |
| 7 Docs | README, WRITEUP, SOURCE.md written. Remaining: chat export, deploy, live extraction eval. |

Open questions from §8 answered by the schema: many invoices per entry are allowed; there is no assist element (assist goes in line value); origin and MID are per line only; the MID is a plain ≤15-char string; entry type 01 is valid; the transmit flag is `<transmit/>`, and omitting it stages only.

## 0. What's actually being graded

From the brief, verbatim:

| Criterion | What it means in practice |
|---|---|
| "how resourceful you are in tracking down how NetCHB works" | Did you find the **real published schema**, or invent plausible-looking XML? |
| "how accurately you extract the data" | Does extraction generalise to layouts you've never seen? |
| "the judgment you show when the documents don't give you everything neatly" | Did you catch the assist, the Bangladesh-origin line, the arithmetic error, the qty mismatch? |
| "how honest you are about what you don't know" | Does the app distinguish **extracted** vs **derived** vs **assumed** vs **missing**? |
| "how effectively you use AI along the way" | Full chat history is a deliverable. Save everything. |

The differentiator is **not** the extraction. Any competent submission extracts text from a PDF. The differentiator is the **reconciliation and judgment layer** — and surfacing it in the UI.

Also: there's a 45-min walkthrough call with **a small live change** to the solution. Write code you can confidently modify in front of someone. Favour boring, readable, well-separated modules over clever ones.

---

## 1. Recon findings so far (Phase 0, partially done)

### NetCHB — what's confirmed

- NetCHB is now **Descartes NetCHB** (acquired by The Descartes Systems Group). Marketing site: `home.netchb.com`. Application/login: `www.netchb.com/security/`. Support portal: `servicedesk.descartes.com`.
- Their LinkedIn specialties list includes **"XML Uploads"**, **EDI**, and **FTP** alongside ABI/ACE/ISF — confirming an XML ingestion path exists.
- The integration is a **SOAP web service** with a **WSDL**. The operation signature is:
  ```
  uploadEntry(username, password, entryXml)
  ```
  i.e. credentials plus the entry XML as a string payload.
- NetCHB publishes **two XSDs**: `entry.xsd` (the entry document) and `data_type.xsd` (shared simple/complex types, imported by `entry.xsd`). `entry.xsd` contains an `<xs:import>`/`<xs:include>` pointing at `data_type.xsd` — if you download both locally you must repoint that reference at the local copy or validation will fail trying to fetch over the network.
- Two behaviours worth knowing:
  - **Duty is not calculated by us.** NetCHB computes duty from the tariff codes, unless the entry is explicitly flagged as precalculated. So the app does **not** need a duty engine.
  - **A `transmit` flag controls CBP submission.** If the generated XML omits the transmit tag, uploading it stages an entry in NetCHB without transmitting anything to CBP. This is the safe default and should be stated loudly in the README.

### Still to find (first task tomorrow)

The exact public URLs for `entry.xsd`, `data_type.xsd`, and the WSDL. They are not well indexed by search engines. Leads, in order of likely payoff:

1. Descartes service desk / knowledge base: `servicedesk.descartes.com/support/home` — search "XML upload", "entry XML", "web service".
2. Guess common paths off `www.netchb.com`: `/xmlupload/`, `/schema/`, `/schemas/`, `/docs/`, `/webservice/`, `/ws/`, `?wsdl` suffixes. (`/xml/` and `/xml/entry.xsd` both 404'd.)
3. The NetCHB app's own help/download section (may need an account).
4. Third-party integrators who document their NetCHB connector (Cervo, Flexport, CargoWise-adjacent tooling) sometimes link the spec. Flexport's doc-type list already references `customs_us_ftz_entry_7501_netchb_upload`, which implies a documented upload format.
5. Google/Bing with `filetype:xsd netchb`, `inurl:netchb xsd`, and site-restricted queries on descartes.com.

**Integrity note.** While searching, a GitHub repo from another candidate doing this same assignment surfaced in results. Do not open it, do not read its code, do not borrow its structure. The facts above (XSD filenames, `uploadEntry` signature, duty/transmit behaviour) came from a public search snippet and are the kind of thing we'd confirm from the primary source anyway — confirm them against NetCHB's own documentation before relying on them, and cite the primary source in the writeup. Anything we can't confirm independently gets stated as an assumption.

**Fallback if the XSD is genuinely unobtainable:** build to a documented, clearly-labelled approximation derived from CBP Form 7501 field definitions and the ACE ABI CATAIR Entry Summary (AE) record layouts (both public, `cbp.gov`), and say plainly in the README and writeup that the schema is approximated and why. Honesty beats fabrication here — the brief rewards it explicitly. But exhaust the search first; the real schema is worth several grades.

---

## 2. The sample shipment — ground truth

This becomes `fixtures/shipment-001/` and the primary test case. Hand-transcribe this; do not let the model generate the fixture it's being tested against.

### Parties

| Role | Entity | Notes |
|---|---|---|
| Seller / invoicing party | Kowloon Bay Apparel Sourcing Ltd, Kwun Tong, Hong Kong | Issues invoice, bank beneficiary. **Not** the manufacturer. |
| Manufacturer | Saigon Phoenix Garment JSC, Lot C7-C8, Road No. 9, Song Than 2 IP, Di An City, Binh Duong, Vietnam | Tax code 3702148865. **MID derives from this.** |
| Importer of record (probable) | Northbound Outfitters, Inc., 2150 NW Raleigh St Suite 300, Portland OR 97210 | Buyer, P.O. holder, B/L notify party. **Needs confirmation.** |
| Ship-to / consignee on B/L | Cascade Fulfillment Partners LLC, 21820 76th Ave S Dock 4, Kent WA 98032 | 3PL warehouse, "for account of Northbound". Transport-document role ≠ customs role. |
| NVOCC | Blue Meridian Logistics (Vietnam) Co Ltd | FMC NVOCC 029415N, SCAC **BMLV** |
| Ocean carrier | Orient Pacific Lines | SCAC **OPLU** |

### Transport

- House B/L **BMLVHCM26090418** (SCAC BMLV) riding on master B/L **OPLUSGN260917735** (SCAC OPLU). Entry needs both, each with its correct SCAC.
- Vessel/voyage: PACIFIC ARGOS / 041E. Shipped on board 24-Sep-2026. ETA Tacoma 14-Oct-2026.
- Loading: Cat Lai, HCMC, VN. Discharge: **Tacoma, WA** → port of entry code needed (Tacoma is **3002**; verify against the CBP port code list, don't trust memory).
- Container: **OPLU3041728 struck through, OPLU 3041722 handwritten beside it.** Seal OPL7731482. 1 × 20'GP. **Never auto-pick between a struck-through value and its replacement — flag it.**
- Telex released / originals surrendered at origin, 25-Sep-2026. 3 originals issued.
- Movement: CY/CFS, freight prepaid, door delivery via Tacoma ramp/truck to Kent WA.

### Line items — corrected

| # | Style | HS (6) | Qty | Unit | Extension | Origin | Notes |
|---|---|---|---|---|---|---|---|
| 1 | NB-T101 | 6109.10 | 2,400 PCS | 2.85 | **6,840.00** | VN | Invoice prints **6,480.00** — transposition error. 2400 × 2.85 = 6,840, and only 6,840 reconciles with the printed subtotal 21,975. |
| 2 | NB-H205 | 6110.20 | 1,200 (inv) / **1,176** (PL) | 7.40 | 8,880.00 | VN | 24-pc discrepancy. PL: 49 ctn × 24 pcs = 1,176. |
| 3 | NB-C330 | 6203.42 | 900 PCS | 6.95 | 6,255.00 | VN | |
| 4 | W-B220 | 6206.40 | 600 PCS | 2.10 | 1,260.00 | VN | **CMT price only. Assist: buyer-supplied fabric, 1,450 m, USD 4,180, P.O. NB-26-0918F.** Dutiable value = 1,260 + 4,180 = **5,440**. |
| 5 | NB-P118S | 6106.10 | 24 PCS | 1.00 | 24.00 | **BD** | FOC samples, NCV, excluded from invoice total. **Origin Bangladesh** (sister unit, Gazipur) — different MID, different origin, inside a shipment otherwise declared Vietnam. |

### Valuation

```
Sum of lines 1–4 (FOB)              23,235.00
+ ocean freight                      3,850.00   non-dutiable, separately stated
+ marine insurance                     185.00   non-dutiable, separately stated
= CIF Tacoma                        27,270.00   ← matches invoice total
Customs value base (lines 1–4)      23,235.00
+ assist (W-B220 fabric)             4,180.00
= dutiable value, lines 1–4         27,415.00
Line 5 declared separately               24.00   (FOC, value for customs purposes)
```

Incoterm **CIF Tacoma (Incoterms 2020)**. Currency USD throughout, so no exchange rate needed — but the app must handle non-USD.

### The quantity trap, explained

Both documents total **5,100 pcs**, which looks like agreement. It isn't:

- Invoice: 2400 + 1200 + 900 + 600 = 5,100, **excluding** the 24 FOC samples.
- Packing list: 2400 + 1176 + 900 + 600 + 24 = 5,100, **including** the 24 samples.

The hoodie line is short by exactly the sample count. Matching grand totals are camouflage. **Reconcile per line item, never on totals alone.** This is the single best demonstration of the judgment they're testing for.

### Other discrepancies

- Gross weight: packing list **1,888.00 kg**, B/L **1,930.000 kg** (~42 kg gap, plausibly pallets/dunnage). Net 1,734.50 kg. Measurement 13.58 CBM both.
- Carton count 138 agrees across packing list and B/L. Carton numbering 1–138 continuous.
- HS codes are **6-digit**; CBP requires **10-digit HTSUS**. Propose a candidate with reasoning, mark for broker review, never assert confidence we don't have.

---

## 3. Architecture

### The one load-bearing idea

**Three stages, with a hard wall between the probabilistic one and the deterministic ones.**

```
PDFs ──► [1 EXTRACT]  LLM, per-document, no cross-document reasoning
              │        → DocumentExtraction[]  (every field carries source + confidence)
              ▼
         [2 RECONCILE] pure TypeScript, zero LLM calls
              │        → ShipmentFacts + Finding[]
              ▼
         [3 MAP+EMIT]  pure TypeScript
                       → NetCHB entry XML + MissingField[]
```

Why this matters, and what to say on the call:

- **LLMs do not do arithmetic reliably, and must never do compliance logic.** Every number that matters is recomputed in TypeScript. The model's only job is "what does this document say", never "what does this mean".
- **`POST /api/entry` becomes a pure function of `(extractions, brokerInputs)`.** Editing a field in the UI rebuilds the XML instantly with no model call, no cost, no latency. Great demo, and it makes the live change on the call trivial.
- **Every finding is reproducible and testable.** The rules engine is unit-tested against the fixture. A rule either fires or it doesn't.

### Repo layout

```
sefer-entry/
├── CLAUDE.md
├── PLAN.md
├── README.md
├── WRITEUP.md                    # the one-pager
├── .env.example
├── schemas/
│   ├── entry.original.xsd        # untouched download
│   ├── entry.xsd                 # working copy, import repointed locally
│   ├── data_type.xsd
│   └── SOURCE.md                 # where each file came from, when, how found
├── fixtures/
│   └── shipment-001/
│       ├── *.pdf
│       ├── expected-extraction.json   # hand-transcribed, NOT model-generated
│       └── expected-findings.json
├── src/
│   ├── app/
│   │   ├── page.tsx                   # upload + review + XML, single screen
│   │   └── api/
│   │       ├── extract/route.ts       # PDFs  → DocumentExtraction[]
│   │       └── entry/route.ts         # facts → XML + findings   (pure, no LLM)
│   ├── components/
│   │   ├── UploadZone.tsx
│   │   ├── ExtractionReview.tsx       # editable fields, source + confidence badges
│   │   ├── FindingsPanel.tsx          # the money shot
│   │   ├── BrokerInputsForm.tsx       # fields no document can provide
│   │   └── XmlViewer.tsx              # highlight, copy, download, XSD status
│   ├── lib/
│   │   ├── extract/
│   │   │   ├── schema.ts              # Zod: DocumentExtraction
│   │   │   ├── prompt.ts
│   │   │   ├── classify.ts            # which doc type is this?
│   │   │   └── client.ts              # Anthropic SDK, native PDF input
│   │   ├── reconcile/
│   │   │   ├── index.ts               # orchestrator
│   │   │   ├── rules/                 # one file per rule, see §4
│   │   │   ├── valuation.ts           # incoterm → customs value, assists
│   │   │   ├── parties.ts             # role resolution + MID construction
│   │   │   └── types.ts               # ShipmentFacts, Finding
│   │   ├── netchb/
│   │   │   ├── map.ts                 # ShipmentFacts → entry tree
│   │   │   ├── build.ts               # xmlbuilder2 serialisation
│   │   │   ├── validate.ts            # xmllint-wasm vs entry.xsd
│   │   │   └── codes.ts               # port, country, SCAC, entry-type lookups
│   │   └── util/
│   └── types/
└── tests/
    ├── reconcile.test.ts
    ├── valuation.test.ts
    ├── mid.test.ts
    └── xml.test.ts
```

### Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Frontend and backend in one repo, one deploy. Vercel gives the bonus deployed link for free. |
| Extraction | **Anthropic SDK**, native PDF document blocks | Reads text PDFs *and* scanned/image pages without a separate OCR step. The B/L and packing list here are scans — this matters. |
| Structured output | **Zod** + forced tool-use with a JSON-schema'd tool | Guarantees shape. Retry once on parse failure, then surface honestly. |
| XML | **xmlbuilder2** | Clean tree → string, namespace support. |
| XSD validation | **xmllint-wasm** | Runs in Node and serverless, no native libxml dependency. |
| UI | **Tailwind** + a few shadcn/ui primitives | Fast, unopinionated, looks deliberate. |
| Tests | **Vitest** | Fast, zero config with TS. |

Keep the dependency list short. Every extra package is a thing to explain on the call.

### Core types (sketch — firm these up in Phase 2)

```ts
type FieldSource = 'commercial_invoice' | 'packing_list' | 'bill_of_lading' | 'broker_input' | 'derived';

interface Sourced<T> {
  value: T;
  source: FieldSource;
  confidence: 'high' | 'medium' | 'low';
  evidence?: string;   // short verbatim snippet the model saw
  page?: number;
}

interface Finding {
  id: string;                    // 'R01_LINE_EXTENSION_MISMATCH'
  severity: 'error' | 'warning' | 'info';
  field: string;                 // dotted path into ShipmentFacts
  message: string;               // plain English, broker-readable
  evidence: Array<{ source: FieldSource; text: string }>;
  resolution?: string;           // what we did, or what a human must do
  autoApplied: boolean;          // did we change a value, or just flag it?
}

interface MissingField {
  field: string;
  label: string;
  required: boolean;
  reason: string;                // "no document carries the importer's EIN"
}
```

**Design rule:** nothing is ever silently corrected. If a rule changes a value, `autoApplied: true` and the finding explains the change and shows both numbers.

---

## 4. The rules engine

This is the heart of the submission. Each rule is a pure function `(facts) => Finding[]`, lives in its own file, and has a test.

**Critically: these must be written as general rules, not as patches for this one shipment.** They'll test with documents we haven't seen.

| ID | Rule | Severity |
|---|---|---|
| R01 | Line extension: `qty × unitPrice` vs stated amount. On mismatch, recompute and reconcile against the invoice subtotal to decide which is right. | error |
| R02 | Sum of line extensions vs stated invoice subtotal/total. | error |
| R03 | Per-style quantity: invoice vs packing list. **Match on style/SKU, never on grand total.** | error |
| R04 | Packing list internal math: `cartons × pcs/carton` vs stated total pcs, per line and overall. | error |
| R05 | Carton/package count: packing list vs B/L. | error |
| R06 | Gross weight: packing list vs B/L. Tolerance band; report the delta and which source was used. | warning |
| R07 | Incoterm → customs value. Strip separately-stated international freight and insurance for CIF/CFR/CIP/CPT. Flag EXW/DDP/DAP for broker attention (inland and delivery-cost treatment differs). | info/error |
| R08 | **Assist detection.** Keyword scan for CMT / cut-make-trim / buyer-supplied / free of charge / buyer's fabric / supplied free, paired with a stated value. Add to the dutiable value of the line it relates to. | error |
| R09 | FOC / sample / NCV lines: must still appear on the entry with a declared value. Never drop a line because it's free. | error |
| R10 | Per-line country of origin. Parentheticals and remarks override the shipment-level origin. Any line whose origin differs from the B/L/declaration origin gets flagged loudly. | error |
| R11 | HTS: if fewer than 10 digits, propose a candidate with reasoning and mark `requiresBrokerReview`. Never present a guessed 10-digit as confident. | warning |
| R12 | Party roles: distinguish seller / manufacturer / shipper / IOR / consignee / notify. Derive **MID from the manufacturer**, not the invoicing party. | error |
| R13 | IOR resolution. Prefer the buyer (P.O. holder, "sold to") over the B/L consignee when the consignee reads as a warehouse/3PL ("for account of", "c/o", LLC fulfillment). Always flag for confirmation — never decide silently. | warning |
| R14 | House vs master B/L: detect both, attach the correct SCAC to each. | warning |
| R15 | Amended/struck-through values (container no., quantities). Detect, surface both, **never auto-pick**. | error |
| R16 | Currency: if not USD, an exchange rate is required and no document carries it → missing field. | error |
| R17 | Date sanity: invoice date ≤ B/L date ≤ ETA; dates not absurdly far in past/future. | warning |

### MID construction (CBP manufacturer ID)

Deterministic, implementable, and a visible win. The shape is: ISO country code + up to 3 chars from each of the first two words of the manufacturer name + up to 4 digits from the street address + first 3 letters of the city.

Implement it, unit-test it, **and verify the exact rules against CBP's published MID construction guidance before trusting the output** — the edge cases (numeric handling when >4 digits, single-word names, ignored words like "the"/"and", city truncation) are where it goes wrong. If any input is uncertain, emit the MID with a `requiresBrokerReview` flag rather than asserting it.

### Broker inputs — things no document can ever provide

Surface these as an explicit form, pre-filled only where genuinely safe:

- Filer code (3 char), entry number, entry type (default **01** consumption)
- Importer of record number (EIN/IRS no.) — *confirmed absent from all three documents*
- Bond type (single vs continuous), surety code, bond amount
- Port of entry code (derivable from discharge port, but confirm)
- Estimated entry date, release date
- Broker file/reference number
- Whether ISF has been filed (the B/L says "ISF FILED BY: IMPORTER/AGENT" — i.e. not by us, worth flagging)

---

## 5. Phases and time budget

~18–20 working hours across two days. Ship something complete at every phase boundary; never leave the repo in a non-running state.

| Phase | Work | Est. | Done when |
|---|---|---|---|
| **0** | **Recon.** Find `entry.xsd`, `data_type.xsd`, WSDL. Read them. Save to `schemas/` with `SOURCE.md` recording exactly how each was found. | 2h | XSDs on disk, root element and required fields understood |
| **1** | Scaffold. Next.js + TS + Tailwind + Vitest. `.env.example`. Hello-world deploy to Vercel **immediately** — don't leave deploy to the end. | 1h | Live URL exists |
| **2** | Types + extraction. Zod schema, prompt, Anthropic client, doc classifier. Hand-transcribe `expected-extraction.json` **first**, then make extraction match it. | 3h | Three sample PDFs → correct JSON |
| **3** | **Reconciliation engine.** All 17 rules + valuation + MID + party resolution. Test-first against the fixture. | 4h | All ground-truth discrepancies from §2 detected |
| **4** | XML builder + XSD validation. Map facts → entry tree, serialise, validate. | 3h | Generated XML validates against `entry.xsd` |
| **5** | UI. Upload → extraction review (editable) → findings panel → broker inputs → XML viewer with download. | 3h | Full round trip in the browser |
| **6** | **Generalisation pass.** Test with synthetic variants: air waybill instead of ocean B/L, EUR invoice, FOB terms, single-page invoice, missing packing list, 2 docs instead of 3. Fix what breaks. | 2h | Degrades gracefully, never crashes |
| **7** | README, WRITEUP.md, export chat history, final deploy, generated XML for the sample shipment committed. | 2h | Submission ready |

**Hard rule: Phase 6 is not optional.** "We'll test it with documents you haven't seen" is the stated test. A beautiful app that only works on this one invoice scores badly.

---

## 6. Generalisation checklist

The app must not assume:

- Exactly three documents (handle 1, 2, 4+; handle a single combined PDF)
- Ocean freight (air waybills have no container/seal, different weight basis)
- USD (needs currency + exchange-rate handling)
- CIF (handle EXW, FOB, CFR, DDP, DAP)
- One country of origin per shipment
- HS codes present at all (they may be absent entirely)
- A separate manufacturer (seller and manufacturer are often the same entity)
- Line-item structure on the packing list matching the invoice's
- Latin script / English only
- Text-layer PDFs (scans are the norm, not the exception)

Build 4–5 synthetic test documents in Phase 6 by editing the sample into variants. Cheap, and it finds real bugs.

---

## 7. Deliverables checklist

- [ ] GitHub repo, TypeScript frontend + backend
- [ ] README: what it does, how to run, env vars, architecture diagram, **what it does not do**
- [ ] Deployed link (Vercel) — bonus, but cheap, so get it
- [ ] `output/shipment-001-entry.xml` — the generated entry for the attached shipment, committed
- [ ] Complete AI chat history exported
- [ ] `WRITEUP.md` — one page: approach, key judgment calls, what I'd do with more time

### Writeup — what to actually say

1. **How I found the NetCHB spec**, step by step including dead ends. This is a graded criterion; show the work.
2. **The architecture bet**: LLM extracts, TypeScript decides. Why, and what it buys.
3. **The judgment calls**, each with the evidence and the alternative I rejected: the 6,480/6,840 arithmetic error; the hoodie quantity gap hiding behind matching totals; the fabric assist; the Bangladesh-origin sample line; manufacturer-vs-seller for MID; IOR-vs-consignee.
4. **What I don't know**: 10-digit HTS classification is broker judgment; MID construction needs verification against CBP guidance; I have no way to validate against a live NetCHB account; the struck-through container number is unresolvable from the documents.
5. **With more time**: HTS classification assistant with CSMS/CROSS ruling lookup; Chapter 99 trade-remedy stacking (301/232); PGA message sets; actual `uploadEntry` submission behind broker credentials; multi-invoice shipments; a feedback loop where broker corrections become extraction few-shot examples.

---

## 8. Open questions to resolve in Phase 0

1. Exact public URL of `entry.xsd` / `data_type.xsd` / WSDL. **Blocking for Phase 4.**
2. Does `entry.xsd` express one invoice per entry or many? (Real entries routinely have multiple invoices.)
3. Where do assists live in the schema — a line-level adjustment element, or folded into declared value?
4. How is per-line country of origin represented, and does it coexist with a header-level origin?
5. Is the MID a plain string field, or does NetCHB construct it from party details?
6. Entry type codes — confirm `01` is the right default for a straightforward consumption entry.
7. Confirm the transmit flag's name and that omitting it is genuinely non-transmitting.

---

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Can't find the real XSD | Timebox the hunt to 2h. Fall back to a documented 7501/CATAIR-derived approximation, labelled as such. Never fabricate silently. |
| Extraction fails on scanned pages | Anthropic native PDF handles scans. Fallback: rasterise pages and send as images. |
| Over-fitting to the sample | Phase 6 exists for this. Write rules against *document semantics*, never against this invoice's layout. |
| Running out of time | Phases 0–5 produce a complete submission. Phase 6 improves the score. Phase 7 is non-negotiable — reserve it. |
| Serverless cold start / payload limits on Vercel | Keep PDFs under the body limit; stream or use a route config bump if needed. Test the deployed path early, not at the end. |
| Live-change exercise on the call | Keep modules small and single-purpose. Adding a new rule should be: one file in `rules/`, one line in the registry, one test. |
