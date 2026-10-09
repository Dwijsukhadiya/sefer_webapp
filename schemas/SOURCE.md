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

## 3. The entry document schema

- `https://www.netchb.com/xml/entry/entry.xsd` **exists**: it returns content served as binary/octet-stream, while sibling guesses return 404.
- This sandbox's egress policy blocks `www.netchb.com`, so the file is downloaded manually in a browser and committed here as `entry.original.xsd` (untouched) and `entry.xsd` (working copy with its import repointed at the local `data_type.xsd`).
- `data_type.xsd` is not at `/xml/entry/data_type.xsd` or `/xml/data_type.xsd`. Its real location is the `schemaLocation` inside `entry.xsd`.

STATUS: waiting for the manual download.

## Integrity note

While searching, a public GitHub repo from another candidate doing this assignment appeared in search results. It was not opened. Every fact above comes from NetCHB's own server.
