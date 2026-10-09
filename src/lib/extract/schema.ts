import { z } from "zod";

/**
 * What the LLM must return for ONE document. It describes what the page SAYS,
 * never what it means: no arithmetic, no valuation, no origin decisions.
 * Everything is nullable because real documents omit things.
 */

export const DocType = z.enum([
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "air_waybill",
  "other",
]);
export type DocType = z.infer<typeof DocType>;

export const PartyRole = z.enum([
  "seller", // invoicing party / exporter on the invoice
  "buyer", // sold-to / bill-to
  "ship_to", // deliver-to
  "shipper", // shipper on a transport document
  "consignee",
  "notify",
  "manufacturer", // explicitly identified producer / factory
  "carrier",
  "nvocc",
  "other",
]);

export const Party = z.object({
  role: PartyRole,
  name: z.string(),
  addressLines: z.array(z.string()).describe("Street-level address lines, verbatim"),
  city: z.string().nullable(),
  stateOrProvince: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable().describe("Country as printed, e.g. 'VIETNAM' or 'U.S.A.'"),
  taxId: z.string().nullable(),
  scac: z.string().nullable(),
  qualifier: z
    .string()
    .nullable()
    .describe("Verbatim phrases like 'on behalf of X', 'O/B X', 'for account of X', 'c/o X'"),
});
export type Party = z.infer<typeof Party>;

export const Amendment = z.object({
  field: z.string().describe("Which field was amended, e.g. 'container number'"),
  original: z.string().describe("The struck-through or overwritten value"),
  replacement: z.string().nullable().describe("The new/handwritten value, if any"),
  kind: z.enum(["struck_through", "handwritten", "overstamp", "correction_fluid", "other"]),
});

export const Container = z.object({
  number: z.string().describe("As printed. If amended, the value that appears to be current"),
  sealNumbers: z.array(z.string()),
  sizeType: z.string().nullable(),
});

export const LineItem = z.object({
  lineNo: z.string().nullable(),
  styleOrSku: z.string().nullable(),
  description: z.string(),
  fibreOrMaterial: z.string().nullable().describe("Composition as printed, e.g. '100% Cotton'"),
  construction: z.string().nullable().describe("e.g. knitted, woven"),
  hsCode: z.string().nullable().describe("Exactly as printed, do not pad or guess digits"),
  quantity: z.number().nullable(),
  uom: z.string().nullable(),
  unitPrice: z.number().nullable().describe("Positive number even if shown in parentheses"),
  amount: z.number().nullable().describe("The extension EXACTLY as printed. Do not recompute."),
  excludedFromTotal: z
    .boolean()
    .describe("True if the doc shows the value in parentheses, marks it NCV/FOC, or says it is not included"),
  cartonRange: z.string().nullable(),
  cartons: z.number().nullable(),
  piecesPerCarton: z.number().nullable(),
  netWeightKg: z.number().nullable(),
  grossWeightKg: z.number().nullable(),
  lineNotes: z
    .array(z.string())
    .describe("Every remark attached to this line verbatim: origin notes, FOC, CMT, 'see note (*)'"),
});
export type LineItem = z.infer<typeof LineItem>;

export const Charge = z.object({
  kind: z.enum(["freight", "insurance", "discount", "commission", "packing", "other"]),
  description: z.string(),
  amount: z.number(),
});

export const DocumentExtraction = z.object({
  docType: DocType,
  documentNumber: z.string().nullable(),
  documentDateRaw: z.string().nullable().describe("Exactly as printed, e.g. '12/09/2026'. Do not reformat."),
  currency: z.string().nullable(),
  incoterm: z.string().nullable().describe("3-letter code only, e.g. CIF"),
  incotermPlace: z.string().nullable(),
  statedCountryOfOrigin: z.string().nullable().describe("Shipment-level origin as stated"),
  parties: z.array(Party),
  poNumbers: z.array(z.string()),
  invoiceNumbers: z.array(z.string()).describe("Invoice numbers referenced (incl. on B/L / packing list)"),
  houseBill: z.string().nullable(),
  masterBill: z.string().nullable(),
  bookingNumber: z.string().nullable(),
  vessel: z.string().nullable(),
  voyage: z.string().nullable(),
  portOfLoading: z.string().nullable(),
  portOfDischarge: z.string().nullable(),
  placeOfDelivery: z.string().nullable(),
  etdRaw: z.string().nullable(),
  etaRaw: z.string().nullable(),
  onBoardDateRaw: z.string().nullable(),
  containers: z.array(Container),
  amendments: z.array(Amendment).describe("Anything struck through, handwritten over or corrected"),
  lineItems: z.array(LineItem),
  charges: z.array(Charge).describe("Freight, insurance etc. stated separately from goods"),
  totals: z.object({
    subtotal: z.number().nullable().describe("Goods subtotal as printed (e.g. FOB total)"),
    grandTotal: z.number().nullable().describe("Invoice total as printed (e.g. CIF total)"),
    totalQuantity: z.number().nullable(),
    totalPackages: z.number().nullable(),
    packageType: z.string().nullable(),
    grossWeightKg: z.number().nullable(),
    netWeightKg: z.number().nullable(),
    volumeCbm: z.number().nullable(),
  }),
  shippingMarks: z.array(z.string()),
  notes: z.array(z.string()).describe("Every footnote, remark and declaration, verbatim"),
  uncertain: z
    .array(z.object({ field: z.string(), reason: z.string() }))
    .describe("Fields you could not read confidently (smudged, cut off, ambiguous)"),
});
export type DocumentExtraction = z.infer<typeof DocumentExtraction>;

/** One uploaded file can contain several documents (e.g. a combined PDF). */
export const FileExtraction = z.object({
  documents: z.array(DocumentExtraction),
});
export type FileExtraction = z.infer<typeof FileExtraction>;

export type ExtractedDoc = DocumentExtraction & { sourceFile: string };

/**
 * A second, independent read of the identifiers that are expensive to get wrong and hard to
 * catch by cross-checking (a misread bill number fails cargo release). Compared with the main
 * transcription in verify.ts.
 */
export const IdentifierRead = z.object({
  documents: z.array(z.object({
    docType: DocType,
    documentNumber: z.string().nullable(),
    houseBill: z.string().nullable(),
    masterBill: z.string().nullable(),
    containerNumbers: z.array(z.string()),
  })),
});
export type IdentifierRead = z.infer<typeof IdentifierRead>;
