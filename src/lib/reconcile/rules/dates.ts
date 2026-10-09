import { daysBetween, parseDate } from "../../util/dates";
import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * Resolve ambiguous dates (12/09/2026) using the other dates on the shipment, and check
 * the sequence invoice ≤ export ≤ arrival.
 */
export const dates: Rule = {
  id: "DATES",
  description: "Ambiguous date formats and date ordering",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const inv = docsOf(docs, "commercial_invoice")[0];
    const parsed = parseDate(inv?.documentDateRaw);

    if (inv && parsed && parsed.candidates.length > 1) {
      const anchor = facts.exportDate;
      // Valid reading: on or before export, and not absurdly early.
      const plausible = anchor ? parsed.candidates.filter((d) => daysBetween(d, anchor) >= 0 && daysBetween(d, anchor) <= 180) : [];
      const chosen = plausible.length === 1 ? plausible[0] : null;
      facts.invoiceDate = chosen;
      out.push({
        id: "DATE_AMBIGUOUS",
        severity: chosen ? "info" : "warning",
        category: "dates",
        field: "invoiceDate",
        title: `Invoice date "${parsed.raw}" can be read as ${parsed.candidates.join(" or ")}`,
        detail: chosen
          ? `Only ${chosen} falls before the export date (${anchor}), so the document uses day/month order.`
          : "The other dates on the shipment do not settle it.",
        evidence: [ev(inv, `Invoice Date: ${parsed.raw}`)],
        resolution: chosen ? `Using ${chosen}.` : "Broker must confirm the invoice date.",
        autoApplied: !!chosen,
      });
    }

    const { invoiceDate, exportDate, arrivalDate } = facts;
    if (invoiceDate && exportDate && daysBetween(invoiceDate, exportDate) < 0) {
      out.push({
        id: "DATE_ORDER", severity: "warning", category: "dates", field: "invoiceDate",
        title: `Invoice date ${invoiceDate} is after export ${exportDate}`, detail: "Unusual; may indicate a re-issued invoice.",
        evidence: [], resolution: "Broker should confirm.", autoApplied: false,
      });
    }
    if (exportDate && arrivalDate && daysBetween(exportDate, arrivalDate) < 0) {
      out.push({
        id: "DATE_ORDER", severity: "error", category: "dates", field: "arrivalDate",
        title: `Arrival ${arrivalDate} is before export ${exportDate}`, detail: "Dates are inconsistent.",
        evidence: [], resolution: "Broker must confirm.", autoApplied: false,
      });
    }
    if (!arrivalDate) {
      out.push({
        id: "ARRIVAL_DATE_MISSING", severity: "warning", category: "dates", field: "arrivalDate",
        title: "No estimated arrival date found", detail: "The entry needs an estimated arrival date.",
        evidence: [], resolution: "Broker must supply it from the arrival notice.", autoApplied: false,
      });
    }
    return out;
  },
};
