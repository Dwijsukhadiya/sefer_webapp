# Where the NetCHB interface definitions came from

The brief gave no link to NetCHB's spec. This is the search trail, dead ends included.

## 1. Who NetCHB is (8 Oct 2026)

- `home.netchb.com` is the marketing site. NetCHB is now owned by The Descartes Systems Group. The site has no developer docs.
- NetCHB's LinkedIn page lists "XML Uploads", "EDI" and "File Transfer Program (FTP)" among its specialties. That confirmed an XML ingestion path exists.
- Generic searches ("NetCHB XML web service", "netchb entry xsd") turned up nothing useful. Guessed paths `/xml/`, `/xml/entry.xsd`, `/main/`, `/main/xml/entry.xsd`, `/main/schema/entry.xsd`, `/main/xsd/entry.xsd` and `/main/xmlupload/entry.xsd` all returned 404.

## 2. The SOAP service index (primary source)

`https://www.netchb.com/main/services/entry/EntryUploadService` serves the JBossWS service index for the `netchb.ear/main.war` deployment. It lists about 24 SOAP services: entry upload, ISF, AMS, in-bond, FTZ, AES, importer/bond queries, location, manufacturer, broker, e-bond and authentication.

The entry upload WSDL lives at
`https://www.netchb.com:443/main/services/entry/EntryUploadService?wsdl`.
It is saved here as `EntryUploadService.wsdl`.

What the WSDL establishes:
- Style is **RPC/literal**, namespace `http://www.netchb.com/`, endpoint `https://www.netchb.com:443/main/services/entry/EntryUploadService`.
- `uploadEntry(username, password, entryXml) -> result` (all `xsd:string`). The entry document travels as a string payload. Its structure is **not** defined in the WSDL; `<types>` is empty.
- Sibling operations: `amendEntry`, `queryEntryStatus(entryNumber, externalReferenceNumber)`, `updateBol`, `deleteEntry`, plus Type 86 helpers.

Related services that could be used later: `ManufacturerWebService` (`/main/services/manufacturer/ManufacturerService?wsdl`, for MID lookup), `ImporterQueryWebService` (`/main/services/importerQuery/ImporterQueryService?wsdl`) and `LocationWebService` (`/main/services/trg/LocationService?wsdl`).

## 3. The entry document schema (downloaded 9 Oct 2026)

- `https://www.netchb.com/xml/entry/entry.xsd` exists and returns content served as binary/octet-stream, while the sibling guesses above return 404. The 8 Oct sandbox could not reach netchb.com, so the file was fetched on 9 Oct 2026, 12:59 UTC, from a normal machine with `curl` (HTTP 200, 223,826 bytes).
- Its `<xsd:import namespace="http://www.netchb.com/xml/data" schemaLocation="https://www.netchb.com/xml/data/data_type.xsd"/>` gives the real home of the shared types. That URL returned HTTP 200, 15,889 bytes.
- The server sends `Last-Modified: Thu, 01 Jan 1970`, so the files carry no publication date. The hashes below pin the exact copies used.

| File | What it is | SHA-256 |
|---|---|---|
| `entry.original.xsd` | `entry.xsd`, byte for byte as downloaded | `1bef18d4121f83f7f09a7346fa9d4a1a37310730363b66e6724908a3e5dc7132` |
| `data_type.xsd` | as downloaded | `c1c529ad31045c37f794a4ec230975868d788b5d661348794aa4ffe9b3eb45fc` |
| `entry.xsd` | working copy. One change: the import's `schemaLocation` points to `data_type.xsd` so validation runs offline. | (differs from the original on line 15 only) |

`diff entry.original.xsd entry.xsd` shows that single line.

## 4. What the schema settles (previously assumptions)

Quoted from the annotations in `entry.xsd`:

- **Transmit flag.** "The `<transmit />` tag is optional. If included, NetChb will automatically transmit the entry summary to customs once the upload of this entry is complete." There is also `<transmit-3461/>` for cargo release. **Confirmed:** without these tags an upload only stages the entry. This app never emits them.
- **Duty.** "`<precalculated>` ... If present, this informs NetChb that duties and fees have already been calculated, and NetChb will not calculate duties and fees for the entry." **Confirmed:** NetCHB calculates duty unless told otherwise. This app never emits `<precalculated>` and never computes duty.
- **Entry number.** `<entry-no>` is a choice of `<user-specified>` (filer code + 7-digit number) or `<system-generated/>`. The app uses system-generated unless the broker supplies both values.
- **Root order is strict** (`xsd:sequence`): entry-no, flags, external-reference-number, header, manifest, containers, ace-cargo-release-parties, invoices. The header and line items are `xsd:all`, so order inside them is free.
- **Required header fields:** processing-port, entry-port (4-digit Schedule D), entry-date, entry-type. Importer tax ID is "required unless the entry type is 86".
- **Several invoices per entry** are allowed (`invoice` maxOccurs unbounded). Each invoice has line items, and each line has one or more `<tariff>` with `<tariff-no>` (5 to 10 digits) and `<value>` (dollars, 2 decimals).
- **Per-line origin and MID:** `<country-origin>` (required, ISO-2) and `<manufacturer-id>` (max 15) sit on each line item, with no header-level origin. Per-line origin is the only model.
- **Bills:** `<bill-of-lading>` has separate `master-scac`/`master-bill` and `house-scac`/`house-bill`, plus required `quantity` and `unit`.
- **Formats that bite:** invoice numbers allow only `[A-Za-z0-9-]{1,17}`, so `KBAS/NB/26-0912` is invalid as printed. Party names are max 35 characters. Header `charges`, `gross-weight` and `total-entry-value` are integers.

## 5. What it does not settle

- **Assists.** There is no assist element. `value-adjustment` is documented only for invoice proration. The app puts assists into the line's `<value>` (entered value includes assists by law) and says so in a finding.
- **Bill number format.** Whether NetCHB wants the SCAC repeated inside `master-bill` is not stated. The app strips the issuer SCAC prefix (AMS convention: SCAC + bill number), so `OPLUSGN260917735` becomes `OPLU` + `SGN260917735`, and flags it.
- **Business rules beyond the XSD** (e.g. HTS must be 10 digits, valid MID on file) are enforced by NetCHB and CBP, not the schema. Passing the XSD is necessary, not sufficient. Without a NetCHB account the upload itself could not be tested.

## 6. Other facts used, and where they come from

- **CBP port 3002 = Tacoma, WA:** CBP CSMS bulletins (e.g. CSMS #15-000496, Seattle-area cargo processing) list Seattle 3001, Tacoma 3002 and Sea-Tac 3029 separately. A third-party page claiming the Seattle/Tacoma alliance uses 3001 for both was not trusted.
- **MID construction:** 19 CFR Part 102, Subpart B, Appendix (textile MID rules). The worked examples published there are unit tests in `tests/mid.test.ts`.
- **ISO 6346 container check digit:** used to test the amended container number. `OPLU3041728` should end in 2, so it cannot be a real container; `OPLU3041722` is consistent.

## Integrity note

While searching, a public GitHub repo from another candidate doing this assignment appeared in search results. It was not opened. Every fact above comes from NetCHB's own server.
