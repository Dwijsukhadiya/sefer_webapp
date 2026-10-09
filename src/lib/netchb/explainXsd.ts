/**
 * Turns libxml's schema errors into what a broker should do about them. The raw message is
 * kept alongside, so nothing is hidden; this only adds the plain-language reading.
 */
import type { EntryLine, ShipmentFacts } from "../reconcile/types";
import { xmlLineOrder } from "./map";

export interface XsdIssue {
  message: string; // plain language: what is missing and where to fix it
  raw: string; // the validator's own message
}

const local = (qname: string) => qname.replace(/^\{[^}]*\}/, "");
const human = (el: string) => el.replace(/-/g, " ");

/** Which entry line an XML line number falls in (count the <line-item>s opened before it). */
function lineAt(xml: string, xmlLine: number, lines: EntryLine[]): EntryLine | null {
  const before = xml.split("\n").slice(0, xmlLine).join("\n");
  const n = (before.match(/<line-item>/g) ?? []).length;
  return n > 0 ? lines[n - 1] ?? null : null;
}

const WHERE: Record<string, string> = {
  "tariff-no": "no tariff number. Enter its 10-digit HTS under Entry lines",
  value: "no entered value. Check the line's quantity, unit price and amount under Extracted documents",
  "country-origin": "no country of origin. Check the documents' origin statements",
  "entry-date": "Entry date is required. Set it under Broker inputs → Filing info",
  "entry-port": "Port of entry is required. Set the 4-digit CBP port code under Broker inputs → Transport",
  "processing-port": "Port of entry is required. Set the 4-digit CBP port code under Broker inputs → Transport",
  "invoice-no": "An invoice has no number. Check the invoice under Extracted documents",
  quantity: "The package count is missing. It comes from the bill of lading or packing list",
  unit: "The package type is missing. It comes from the bill of lading or packing list",
};

export function explainXsdErrors(errors: string[], xml: string, facts: ShipmentFacts): XsdIssue[] {
  const ordered = xmlLineOrder(facts);
  return errors.map((raw) => {
    const at = Number(raw.match(/^line (\d+):/)?.[1] ?? 0);
    const line = at ? lineAt(xml, at, ordered) : null;
    const prefix = line ? `Line ${line.sku ?? line.key}: ` : "";
    const el = local(raw.match(/Element '([^']+)'/)?.[1] ?? "");

    // A required child is missing.
    if (/Missing child element/.test(raw)) {
      const expected = [...raw.matchAll(/\{[^}]*\}([\w-]+)/g)].map((m) => m[1]).filter((x) => x !== el);
      if (el === "bill-of-lading" && expected.some((x) => /bill|scac|inbond/.test(x))) {
        return { raw, message: "No bill of lading or air waybill number. Upload the transport document, or check that its bill numbers were read under Extracted documents." };
      }
      const first = expected.find((x) => WHERE[x]) ?? expected[0];
      const advice = WHERE[first ?? ""];
      if (advice) return { raw, message: line && /^[a-z]/.test(advice) ? `${prefix}${advice}.` : `${advice}.` };
      return { raw, message: `${prefix}${human(el)} is incomplete: ${first ? human(first) : "a required field"} is missing.` };
    }

    // A value is present but in the wrong format.
    const value = raw.match(/The value '([^']*)'/)?.[1] ?? raw.match(/'([^']*)' is not a valid value/)?.[1];
    if (el === "importer-tax-id" || el === "tax-id") {
      return { raw, message: `Importer number "${value ?? ""}" is not a valid IRS/EIN or CBP number (NN-NNNNNNNXX). Fix it under Broker inputs → Parties.` };
    }
    if (/facet 'pattern'|facet 'maxLength'|facet 'enumeration'|not a valid value/.test(raw)) {
      return { raw, message: `${prefix}${human(el)} "${value ?? ""}" is not in the format NetCHB accepts.` };
    }
    if (/This element is not expected/.test(raw)) {
      return { raw, message: `${prefix}${human(el)} is out of place in the XML. This is a mapping bug; please report it.` };
    }
    return { raw, message: `${prefix}${el ? human(el) + ": " : ""}${raw.replace(/^line \d+: Schemas validity error : /, "").replace(/\{[^}]*\}/g, "")}` };
  });
}
