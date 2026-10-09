import { create } from "xmlbuilder2";
import { NETCHB_NS, type XmlNode, type XmlValue } from "./map";

/** Drop undefined/empty-string leaves so optional elements are omitted, not emitted empty. */
function prune(v: XmlValue): XmlValue {
  if (v === undefined || v === "") return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const xs = v.map((x) => prune(x)).filter((x): x is string | XmlNode => x !== undefined && !Array.isArray(x));
    return xs.length ? xs : undefined;
  }
  const out: XmlNode = {};
  const isMarker = Object.keys(v).length === 0; // {} means an intentionally empty tag, e.g. <system-generated/>
  for (const [k, child] of Object.entries(v)) {
    const p = prune(child);
    if (p !== undefined) out[k] = p;
  }
  return isMarker || Object.keys(out).length ? out : undefined;
}

/** Serialise the mapped tree as a NetCHB <entry> document. */
export function buildXml(tree: XmlNode): string {
  const root = { entry: { "@xmlns": NETCHB_NS, ...(prune(tree) as XmlNode) } };
  return create({ version: "1.0", encoding: "UTF-8" }, root).end({ prettyPrint: true, indent: "  " });
}
