import { docsOf, normKey } from "../facts";
import { ev, lineLabel } from "../helpers";
import type { Finding, Rule } from "../types";

/**
 * For textiles, the chief-weight fibre decides the HTS subheading (e.g. 6110.20
 * cotton vs 6110.30 man-made). Invoice and packing list must agree.
 */
const ABBREV: Record<string, string> = {
  C: "cotton", T: "polyester", P: "polyester", R: "rayon", V: "viscose", N: "nylon", W: "wool", L: "linen", S: "silk",
};
const NAMES: Array<[RegExp, string]> = [
  [/cotton|\bcot\b/i, "cotton"], [/polyester|\bpoly\b|\bpes\b/i, "polyester"], [/elastane|spandex|lycra/i, "elastane"],
  [/nylon|polyamide/i, "nylon"], [/viscose|rayon/i, "viscose"], [/wool/i, "wool"], [/linen/i, "linen"], [/silk/i, "silk"], [/acrylic/i, "acrylic"],
];
const fibreName = (s: string) => NAMES.find(([re]) => re.test(s))?.[1] ?? null;

export function parseFibre(text: string | null): Record<string, number> | null {
  if (!text) return null;
  const out: Record<string, number> = {};
  // "60% Cotton 40% Polyester"
  for (const m of text.matchAll(/(\d{1,3})\s*%\s*([A-Za-z]+)/g)) {
    const f = fibreName(m[2]); if (f) out[f] = (out[f] ?? 0) + +m[1];
  }
  if (Object.keys(out).length) return out;
  // "98/2 COTTON/SPANDEX"
  let m = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})\s+([A-Za-z]+)\s*\/\s*([A-Za-z]+)/);
  if (m) {
    const a = fibreName(m[3]), b = fibreName(m[4]);
    if (a && b) return { [a]: +m[1], [b]: +m[2] };
  }
  // "TC 65/35" or "CVC 60/40": letters map to fibres in order
  m = text.match(/\b(TC|CT|CVC|PC|CP)\s*(\d{1,3})\s*\/\s*(\d{1,3})/i);
  if (m) {
    const code = m[1].toUpperCase();
    const order = code === "CVC" ? ["cotton", "polyester"] : code.split("").map((ch) => ABBREV[ch]);
    return { [order[0]]: +m[2], [order[1]]: +m[3] };
  }
  // "100% Polyester" handled above; bare "100 COTTON"
  const single = fibreName(text);
  return single && /100/.test(text) ? { [single]: 100 } : null;
}

const chief = (f: Record<string, number>) => Object.entries(f).sort((a, b) => b[1] - a[1])[0]?.[0];

export const fibreContent: Rule = {
  id: "FIBRE_MISMATCH",
  description: "Fibre composition: invoice vs packing list",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const invoices = docsOf(docs, "commercial_invoice");
    const pl = docsOf(docs, "packing_list")[0];
    if (!invoices.length || !pl) return out;
    for (const line of facts.lines) {
      const inv = invoices[line.invoice ?? 0]; // the invoice this line came from
      if (!inv) continue;
      const a = inv.lineItems.find((x) => normKey(x.styleOrSku) === normKey(line.sku));
      const b = pl.lineItems.find((x) => normKey(x.styleOrSku) && normKey(x.styleOrSku) === normKey(line.sku));
      const fa = parseFibre(a?.fibreOrMaterial ?? null), fb = parseFibre(b?.fibreOrMaterial ?? null);
      if (!fa || !fb) continue;
      const same = Object.keys({ ...fa, ...fb }).every((k) => (fa[k] ?? 0) === (fb[k] ?? 0));
      if (same) continue;
      const chiefDiffers = chief(fa) !== chief(fb);
      out.push({
        id: "FIBRE_MISMATCH",
        severity: chiefDiffers ? "error" : "warning",
        category: "classification",
        field: `lines[${line.key}].fibre`,
        title: `${lineLabel(line)}: fibre content differs between invoice and packing list`,
        detail:
          `Invoice: ${a!.fibreOrMaterial}. Packing list: ${b!.fibreOrMaterial}` +
          (/\bTC\b/i.test(b!.fibreOrMaterial ?? "") ? ` ("TC" conventionally means Tetoron/polyester first, then cotton).` : ".") +
          (chiefDiffers
            ? ` The chief-weight fibre is ${chief(fa)} on one and ${chief(fb)} on the other. For apparel that changes the HTS subheading and the duty rate.`
            : " The chief fibre is the same, so the heading likely holds, but the statistical suffix or textile category may change."),
        evidence: [ev(inv, a!.fibreOrMaterial!), ev(pl, b!.fibreOrMaterial!)],
        resolution: "Classification left for broker review. Obtain a fibre content certificate or a lab test from the factory.",
        autoApplied: false,
      });
    }
    return out;
  },
};
