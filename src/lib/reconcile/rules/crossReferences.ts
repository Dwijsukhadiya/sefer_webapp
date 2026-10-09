import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Identifiers printed on more than one document must agree. This is the free, deterministic
 * guard against a misread bill or invoice number: two documents are two independent prints
 * of the same number. A mismatch is shown with both values; the code never picks one.
 */
export const crossReferences: Rule = {
  id: "CROSS_REFERENCE",
  description: "Bill and invoice numbers quoted on one document vs the document itself",
  run: ({ docs }) => {
    const out: Finding[] = [];
    const transport = docsOf(docs, "bill_of_lading", "air_waybill")[0];
    const invoices = docsOf(docs, "commercial_invoice");

    // 1. The B/L or AWB number quoted on the invoice / packing list.
    if (transport) {
      // Compare with the bill fields the entry will use; the document number only stands in
      // when no bill number was read at all.
      const bills = [transport.houseBill, transport.masterBill].map(norm).filter(Boolean);
      const own = bills.length ? bills : [norm(transport.documentNumber)].filter(Boolean);
      for (const d of docs) {
        if (d === transport || d.docType === "bill_of_lading" || d.docType === "air_waybill") continue;
        for (const ref of [d.houseBill, d.masterBill]) {
          if (!ref || !own.length || own.includes(norm(ref))) continue;
          out.push({
            id: "BILL_REFERENCE_MISMATCH", severity: "error", category: "transport", field: "billOfLading",
            title: `The ${d.docType.replace(/_/g, " ")} quotes bill ${ref}, but the ${transport.docType.replace(/_/g, " ")} reads ${transport.houseBill ?? transport.masterBill ?? transport.documentNumber}`,
            detail: "The same number printed on two documents was read two different ways, or the documents belong to different shipments. Cargo release fails if the entry carries the wrong bill number.",
            evidence: [ev(d, `B/L No. ${ref}`), ev(transport, `Bill ${[transport.houseBill, transport.masterBill].filter(Boolean).join(" / ")}`)],
            resolution: "Compare both documents (View source) and correct the misread value under Extracted documents.",
            autoApplied: false,
          });
        }
      }
    }

    // 2. Invoice numbers quoted on the B/L or packing list.
    if (invoices.length) {
      const own = invoices.map((d) => norm(d.documentNumber)).filter(Boolean);
      for (const d of docs) {
        if (d.docType === "commercial_invoice") continue;
        for (const ref of d.invoiceNumbers) {
          if (!norm(ref) || own.includes(norm(ref))) continue;
          out.push({
            id: "INVOICE_REFERENCE_MISMATCH", severity: "warning", category: "completeness", field: "invoices",
            title: `The ${d.docType.replace(/_/g, " ")} refers to invoice ${ref}, which is not among the uploaded invoices`,
            detail: `Uploaded invoice number(s): ${invoices.map((i) => i.documentNumber ?? "?").join(", ")}. Either a number was misread, or an invoice for this shipment is missing.`,
            evidence: [ev(d, `Invoice ref ${ref}`), ...invoices.map((i) => ev(i, `Invoice No. ${i.documentNumber ?? "?"}`))],
            resolution: "Check the number against both documents, and upload any missing invoice.",
            autoApplied: false,
          });
        }
      }
    }
    return out;
  },
};
