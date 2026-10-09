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

/** NetCHB containerType enumerations (entry.xsd, containerType). */
export function containerSize(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  const len = s.match(/\b(20|40|45|53)\s*(?:'|FT|FOOT)?/);
  if (!len) return null;
  const hc = /\bH[CQ]\b|HIGH\s*CUBE|\d{2}\s*'?\s*H[CQ]/.test(s);
  return `${len[1]} ft${hc ? " HC" : ""}`;
}

export function containerType(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (/R[FH]\b|REEFER/.test(s)) return "Reefer";
  if (/OT\b|OPEN/.test(s)) return "Open";
  if (/FR\b|FLAT/.test(s)) return "Flat Rack";
  if (/TK\b|TANK/.test(s)) return "Tank";
  if (/GP\b|DV\b|DC\b|DRY|H[CQ]\b/.test(s)) return "Dry";
  return null;
}

/** Manifest quantity unit (max 5 chars in entry.xsd). Common ANSI X12 package codes. */
const PACKAGE_UNITS: Array<[RegExp, string]> = [
  [/CARTON|CTN/i, "CTN"], [/PALLET|PLT/i, "PLT"], [/PACKAGE|PKG/i, "PKG"], [/CASE/i, "CAS"],
  [/BALE/i, "BLE"], [/ROLL/i, "ROL"], [/BAG/i, "BAG"], [/DRUM/i, "DRM"], [/CRATE/i, "CRT"], [/BOX/i, "BOX"],
];
export function packageUnit(raw: string | null): string | null {
  if (!raw) return null;
  for (const [re, code] of PACKAGE_UNITS) if (re.test(raw)) return code;
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || null;
}

/** CBP mode of transportation codes (entry.xsd modeTransportType). */
export function transportMode(mode: "ocean" | "air" | null, containerised: boolean): string | null {
  if (mode === "ocean") return containerised ? "11" : "10";
  if (mode === "air") return containerised ? "41" : "40";
  return null;
}

export const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "AS", "FM", "GU", "MH", "MP", "PW", "PR", "VI",
]);
