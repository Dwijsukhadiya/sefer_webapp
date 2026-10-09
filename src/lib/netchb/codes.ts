/**
 * Small lookup tables. Deliberately incomplete: an unknown value becomes a finding
 * for the broker, never a guess. Port codes are CBP Schedule D (district+port).
 */
const US_PORTS: Array<[RegExp, string, string]> = [
  [/\bTACOMA\b/i, "3002", "Tacoma, WA"],
  [/\bSEATTLE\b/i, "3001", "Seattle, WA"],
  [/\bLOS ANGELES\b/i, "2704", "Los Angeles, CA"],
  [/\bLONG BEACH\b/i, "2709", "Long Beach, CA"],
  [/\bOAKLAND\b/i, "2811", "Oakland, CA"],
  [/\bNEW YORK\b|\bNEWARK\b|\bELIZABETH\b/i, "4601", "New York/Newark"],
  [/\bSAVANNAH\b/i, "1703", "Savannah, GA"],
  [/\bCHARLESTON\b/i, "1601", "Charleston, SC"],
  [/\bNORFOLK\b/i, "1401", "Norfolk, VA"],
  [/\bHOUSTON\b/i, "5301", "Houston, TX"],
  [/\bMIAMI\b/i, "5201", "Miami, FL"],
  [/\bBALTIMORE\b/i, "1303", "Baltimore, MD"],
  [/\bCHICAGO\b/i, "3901", "Chicago, IL"],
  [/\bJFK\b|KENNEDY/i, "4701", "JFK Airport, NY"],
];

export function usPortCode(text: string | null): { code: string; name: string } | null {
  if (!text) return null;
  for (const [re, code, name] of US_PORTS) if (re.test(text)) return { code, name };
  return null;
}

export const ENTRY_TYPES: Record<string, string> = {
  "01": "Consumption - free and dutiable",
  "11": "Informal - free and dutiable",
  "86": "Section 321 low-value (Type 86)",
};

/** Charges a CIF-family price includes that are not part of US transaction value. */
export const INCOTERMS_INCLUDING_FREIGHT = new Set(["CIF", "CFR", "CPT", "CIP", "DAP", "DPU", "DDP"]);
export const INCOTERMS_INCLUDING_INSURANCE = new Set(["CIF", "CIP", "DAP", "DPU", "DDP"]);
export const INCOTERMS_KNOWN = new Set(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]);
