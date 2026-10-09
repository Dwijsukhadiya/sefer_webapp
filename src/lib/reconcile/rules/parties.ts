import { docsOf, sameCompany } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

const LOOKS_LIKE_3PL = /\b(fulfil+ment|logistics|warehous|3pl|distribution|forward|freight|c\/o|dock)\b/i;

/**
 * Who is who. The importer of record is the party liable for duty, usually the buyer,
 * which is not necessarily the B/L consignee. The MID comes from the manufacturer,
 * never from a trading intermediary.
 */
export const parties: Rule = {
  id: "PARTIES",
  description: "Importer of record, consignee, manufacturer vs seller, MID quality",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const tr = docsOf(docs, "bill_of_lading", "air_waybill")[0];
    const inv = docsOf(docs, "commercial_invoice")[0];
    const { buyer, consignee, seller } = facts;

    // Importer of record
    if (buyer && consignee && !sameCompany(buyer.name, consignee.name)) {
      const forAccount = inv?.parties.find((p) => p.role === "ship_to")?.qualifier ?? "";
      out.push({
        id: "IMPORTER_OF_RECORD",
        severity: "warning",
        category: "parties",
        field: "importer",
        title: `Importer of record assumed to be the buyer, ${buyer.name}, not the B/L consignee, ${consignee.name}`,
        detail:
          `The buyer holds the P.O. and is invoiced. The consignee on the transport document ` +
          (LOOKS_LIKE_3PL.test(consignee.name + " " + consignee.addressLines.join(" ")) ? "looks like a warehouse/3PL" : "is a different company") +
          (forAccount ? ` and the invoice says the delivery is "${forAccount}".` : ".") +
          ` The consignee is a transport role; the importer of record is whoever is liable for duties. The ultimate consignee on the entry is likely also the buyer.`,
        evidence: [
          ...(inv ? [ev(inv, `Sold to: ${buyer.name}`)] : []),
          ...(tr ? [ev(tr, `Consignee: ${consignee.name}`)] : []),
          ...(forAccount && inv ? [ev(inv, forAccount)] : []),
        ],
        resolution: `Entered ${buyer.name} as importer of record. Broker must confirm and supply its IRS/EIN importer number (no document carries it) and confirm a valid bond and CBP Form 5106 are on file.`,
        autoApplied: true,
      });
    }

    // Seller is not the manufacturer
    if (seller && facts.manufacturers.length && !facts.manufacturers.some((m) => sameCompany(m.name, seller.name))) {
      out.push({
        id: "SELLER_NOT_MANUFACTURER",
        severity: "info",
        category: "parties",
        field: "manufacturers",
        title: `Seller ${seller.name} is a trading intermediary; MID is built from the factory instead`,
        detail: `The invoice is issued by ${seller.name} (${seller.countryRaw ?? "?"}), but the goods were made by ${facts.manufacturers.map((m) => `${m.name} (${m.countryIso})`).join(" and ")}. CBP's MID identifies the producer.`,
        evidence: [...(inv ? [ev(inv, `Seller: ${seller.name}`)] : []), ...facts.manufacturers.map((m) => ({ source: m.sources[0], text: `Manufacturer: ${m.name}` }))],
        resolution: "MID constructed from the manufacturer. The seller is reported as the seller party.",
        autoApplied: true,
      });
    }
    if (facts.manufacturers.length === 0) {
      out.push({
        id: "MANUFACTURER_UNKNOWN", severity: "error", category: "parties", field: "manufacturers",
        title: "No manufacturer identified on any document",
        detail: "Every entry line needs a manufacturer ID (MID). The seller may be a trading company.",
        evidence: [], resolution: "Broker must obtain the factory name and address.", autoApplied: false,
      });
    }

    for (const m of facts.manufacturers) {
      if (m.midNeedsReview.length) {
        out.push({
          id: "MID_REVIEW", severity: "warning", category: "parties", field: `manufacturers[${m.key}].mid`,
          title: `MID for ${m.name} is ${m.mid ?? "not computable"}; needs a check`,
          detail: `Built per 19 CFR Part 102 Appendix. ${m.midNeedsReview.join(". ")}.`,
          evidence: [{ source: m.sources[0], text: [m.name, ...m.addressLines, m.city].filter(Boolean).join(", ") }],
          resolution: "Broker should check it against the MID already on file in NetCHB's manufacturer table, if one exists.",
          autoApplied: false,
        });
      }
    }

    // Lines whose origin has no manufacturer
    for (const l of facts.lines) {
      if (!l.manufacturerKey) {
        out.push({
          id: "LINE_MANUFACTURER_MISSING", severity: "error", category: "parties", field: `lines[${l.key}].manufacturer`,
          title: `No manufacturer for line ${l.lineNo ?? l.key} (origin ${l.originIso ?? "?"})`,
          detail: "Each line needs the MID of the producer in the country of origin.",
          evidence: [], resolution: "Broker must supply the manufacturer.", autoApplied: false,
        });
      }
    }
    return out;
  },
};
