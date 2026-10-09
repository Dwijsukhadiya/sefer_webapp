# Writeup: Sefer Entry Prep

## Approach

I made one bet: **the model reads, the code decides.** Extraction is the only probabilistic step. It returns what each page says, verbatim, including the wrong numbers, the struck-through container and the footnotes. Reconciliation (16 rules), valuation, party resolution, MID construction and XML mapping are deterministic TypeScript with tests. That makes every number explainable and every finding reproducible. It also means `/api/entry` is a pure function, so a broker's edits rebuild the entry instantly with no model call.

## Finding NetCHB's format

The brief gave no link, so I went to NetCHB's own server. Its JBossWS service index exposed the `EntryUploadService` WSDL (`uploadEntry(username, password, entryXml)`). The WSDL types the entry as a bare string, so I kept probing paths until `/xml/entry/entry.xsd` answered. Its import led to `data_type.xsd`. Both are committed untouched, with hashes and the full trail, including the 404s, in `schemas/SOURCE.md`. Reading the schema turned two assumptions into facts. `<transmit/>` is what sends to CBP, so my XML omits it and only stages the entry. NetCHB computes duty unless `<precalculated/>` is set. It also exposed traps no sample would show: invoice numbers allow only `[A-Za-z0-9-]{1,17}` (so `KBAS/NB/26-0912` is invalid as printed), party names are capped at 35 characters, and origin and MID exist only per line. The sample entry validates against the real XSD, and a test proves the validator rejects broken variants.

## Judgment calls on the sample

| What the documents say | What I did | Why |
|---|---|---|
| Line 1 printed 6,480.00; 2,400 × 2.85 = 6,840.00 | Entered 6,840, flagged | Only 6,840 reconciles to the 21,975 subtotal, so the printed extension is the typo. Without that cross-check the rule leaves the value alone. |
| Both documents total 5,100 pcs | Reconciled per style: the hoodie is 1,200 vs 1,176 | The gap equals the 24 FOC samples. The invoice counts them separately, the packing list inside its total. Matching totals were camouflage. Entered at the invoice quantity, pending confirmation. |
| W-B220 "CMT price", buyer fabric USD 4,180 | Line value 1,260 + 4,180 = 5,440 | An assist under 19 U.S.C. 1401a(h). The XSD has no assist element, so it goes in the line value and a finding says so. |
| 24 FOC polo samples, "(Origin: Bangladesh)" | Kept on the entry at USD 24, origin BD, MID from SP Garments Dhaka | Free goods are still entered. The line remark overrides the invoice's single-origin declaration, which I flag as inaccurate, along with the "MADE IN VIETNAM" carton marks. |
| Seller in Hong Kong, factory in Binh Duong | MID `VNSAIPHO78DIA` from the factory | The MID identifies the producer. "Lot C7-C8" is ambiguous under the CFR address rule, so it is flagged for checking. |
| B/L consignee is a 3PL "for account of" the buyer | Importer = buyer, flagged, switchable | The consignee is a transport role. I never decide liability silently. |
| CIF 27,270 | Entered value 27,439 = 23,235 FOB + 4,180 assist + 24 samples | Separately stated freight 3,850 and insurance 185 are not dutiable. |
| Container 1728 struck through, 1722 handwritten | Used 1722, error-level finding | The ISO 6346 check digit says 1728 cannot exist. It still needs the carrier's arrival notice to confirm. |
| HS 6-digit only | Emitted as printed, never zero-padded | A padded code looks like a real classification. The schema accepts 5 to 10 digits, so the file stays valid while NetCHB flags it. |

Also caught: gross weight 1,888 vs 1,930 kg (the packing list says "palletized: NO", so pallets don't explain it), hoodie fibre 60/40 cotton vs "TC 65/35" (which flips the chief fibre and therefore the HTS subheading), and the ambiguous date 12/09/2026, resolved to 12 Sep because only that reading precedes shipment.

## What I don't know

- 10-digit HTS classification is broker judgment, and so are Chapter 99 remedies.
- The bill-number format (whether to strip the SCAC prefix) is inferred from AMS convention, not stated by NetCHB.
- Whether NetCHB's business rules accept everything the XSD accepts: I had no account to test an upload.
- Which container number is real, until the carrier confirms.

## Generalising

Rules are written against document meaning, never this invoice's layout. Seven synthetic variants run in the test suite: EUR on FOB terms, CIF without itemised freight, an air waybill, invoice only, no HS codes, seller-is-factory, and two invoices. Each degrades honestly, with no crashes and findings that say what's missing. Building the variants found two real gaps, which I fixed: seller-as-manufacturer, and multi-invoice handling (now warned about).

Running real extraction (Gemini) on the three sample PDFs scored 97–98% field accuracy against the hand-written fixture, and every trap was still caught from the model's own output. The live runs also exposed three bugs the clean fixture never could:
- A sister factory in Bangladesh was being borrowed as the MID source for the Vietnam lines.
- A "supplied free of charge by buyer" assist note made a line look free, which cancelled the 6,840 correction.
- A generic "contracted factory" description was being treated as a manufacturer.

Each is fixed, and pinned by a test built from the real output. The model's answers also vary between runs, which is exactly why the deterministic layer guards against plausible extraction shapes rather than trusting one.

## With more time

One `<invoice>` per source invoice. An HTS assistant backed by CROSS rulings. Schedule D/K tables loaded from CBP. NetCHB `ManufacturerService` lookup for MIDs. A real `uploadEntry` call behind broker credentials. Broker corrections fed back as extraction examples.

## Using AI

I used Claude Code throughout: recon, reading the 6,700-line XSD, scaffolding, rules and tests. The full chat history is in the submission. The fixture the tests check against was hand-transcribed, not model-generated, so the model never grades its own work.
