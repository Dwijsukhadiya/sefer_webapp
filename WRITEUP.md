# Writeup: Sefer Entry Prep

**Approach.** One bet: *the model reads, the code decides.* An LLM transcribes each page verbatim, including wrong numbers, struck-through values and footnotes. Everything after that is deterministic, tested TypeScript: 19 reconciliation rules, valuation, party roles, MID construction and the NetCHB mapping. Every number is explainable, nothing is changed silently (each change is a finding with both values and the evidence), and a broker's edits rebuild the entry instantly with no model call.

**Finding NetCHB's format.** The brief gave no link. NetCHB's own server exposed its `EntryUploadService` WSDL (`uploadEntry(username, password, entryXml)`), and probing found `/xml/entry/entry.xsd` and its `data_type.xsd`. Both are committed byte-for-byte, with hashes and the full trail, dead ends included (`schemas/SOURCE.md`). The schema settled two assumptions: omitting `<transmit/>` only stages the entry, and NetCHB computes duty itself. It also exposed traps the sample hides: invoice numbers allow only `[A-Za-z0-9-]`, names are capped at 35 characters, and origin and MID are per line. The sample's XML validates against the real XSD.

**Judgment calls on the sample.**
- **Line 1 printed 6,480;** 2,400 × 2.85 = 6,840. Only 6,840 reconciles to the subtotal, so the printed figure is the typo.
- **Both documents total 5,100 pieces, but the hoodie is 1,200 vs 1,176.** The gap is the 24 free samples, counted separately on the invoice and inside the packing list total. Reconciling per style catches what matching totals hide.
- **Buyer-supplied fabric (USD 4,180) is an assist:** 1,260 + 4,180 = 5,440.
- **Free samples are still entered** (USD 24) with Bangladesh origin and their own manufacturer, contradicting the invoice's "Vietnam origin" declaration and the carton marks.
- **The MID is built from the Vietnamese factory, not the Hong Kong seller.**
- **The importer of record is the buyer, not the 3PL consignee.** Flagged and switchable, never decided silently.
- **CIF 27,270 becomes an entered value of 27,439,** after removing freight and insurance and adding the assist and samples.
- **The container number is taken from the handwritten correction,** because the ISO check digit proves the struck-through one cannot exist. Still flagged.
- **6-digit HS codes are kept as printed, never zero-padded.**

**What I don't know.** 10-digit classification and Chapter 99 duties are broker judgement. The bill-number format (SCAC split) is inferred from AMS convention. Without a NetCHB account I couldn't test whether its business rules accept everything the XSD does. The MID for "Lot C7-C8" is flagged for checking.

**Generalising and testing.** Rules follow document meaning, not this invoice's layout. 95 tests cover:
- the 11 sample traps;
- shipments the app has never seen: EUR/FOB, an air waybill, invoice only, no HS codes, seller-is-factory, two invoices;
- regression cases from real model output.

Live Gemini extraction scored 97–98% field accuracy and still caught every trap. Real output and deployed testing exposed bugs the clean fixture never could, each now fixed and tested:
- a Bangladesh factory borrowed for the Vietnam lines' MID;
- an assist note that made a line look free;
- false errors on multiple invoices;
- timeouts when the model service was overloaded.

One idea failed honestly. A second read by the *same* model dropped the *same* digit from the master bill, so independent verification needs a different model.

**Built for a broker's workflow.**
- The source document sits beside the data, and every piece of evidence links back to its page.
- Validation errors read as fixes ("Line NB-T101: no tariff number…").
- Possible agency requirements (FDA, FCC…) are flagged as hints.
- An audit-trail export records what the model read, every manual edit, each correction with its evidence, the final XML, and file hashes (19 CFR 163 recordkeeping).

**With more time.**
1. **Independent identifier verification.** Make a different-model second read the default; in testing, `gemini-3-flash-preview` correctly read the master bill the main model had misread, plus the house bill and container. Then cross-check bill and container numbers against the carrier's arrival notice or AMS data, because a wrong bill number fails cargo release.
2. **Persistence and sign-off.** Saved shipments, a preparer-to-licensed-broker approval step, user roles, and a server-side, tamper-evident audit trail kept for the five-year retention period.
3. **More document types.** Certificates of origin (to claim FTA and special-program preferences), arrival notices and ISF data, plus informal (11) and Section 321 (86) entries.

**Using AI.** I used AI assistants throughout: recon, reading the 6,700-line XSD, scaffolding, rules and tests. The full chat history is in the submission. The fixture the tests check against was hand-transcribed, not model-generated, so the model never grades its own work.

*Details: [README](README.md) · [User manual](docs/USER_MANUAL.md) · [NetCHB source trail](schemas/SOURCE.md)*
