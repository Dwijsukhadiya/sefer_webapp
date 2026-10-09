/**
 * CBP Manufacturer Identification Code, per 19 CFR Part 102, Subpart B, Appendix
 * ("Textile and Apparel Manufacturer Identification").
 *   country(2) + name(first 3 chars of first 2 words) + address(first 4 digits of the
 *   largest number on the street line) + city(first 3 letters). Max 15 chars.
 * Returns the code plus every reason a broker should double-check it.
 */

const CANADA_PROVINCES: Record<string, string> = {
  AB: "XA", ALBERTA: "XA", BC: "XC", "BRITISH COLUMBIA": "XC", MB: "XM", MANITOBA: "XM",
  NB: "XB", "NEW BRUNSWICK": "XB", NL: "XW", NEWFOUNDLAND: "XW", NT: "XT", NS: "XN", "NOVA SCOTIA": "XN",
  NU: "XV", NUNAVUT: "XV", ON: "XO", ONTARIO: "XO", PE: "XP", PEI: "XP", QC: "XQ", QUEBEC: "XQ",
  SK: "XS", SASKATCHEWAN: "XS", YT: "XY", YUKON: "XY",
};
const CITY_STATES = new Set(["SG", "MO", "MC", "VA", "HK"]); // CFR: Hong Kong -> HON regardless of district
const IGNORED_WORDS = new Set(["A", "AN", "AND", "OF", "THE"]);

export interface MidInput {
  name: string;
  streetLine: string | null;
  city: string | null;
  countryIso: string | null;
  province?: string | null;
}

export interface MidResult {
  mid: string | null;
  needsReview: string[]; // empty = confident
}

/** Words of the name per the CFR rules: consecutive initials merge, hyphenated parts merge. */
export function nameWords(name: string, countryIso: string | null): string[] {
  const tokens = name
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/(\w)-(\w)/g, "$1$2") // Rawles-Aden -> RAWLESADEN
    .split(/[\s,&]+/)
    .map((t) => t.replace(/[^A-Z0-9.]/g, ""))
    .filter(Boolean);

  const words: string[] = [];
  let initials = "";
  const flush = () => {
    if (initials.length > 1) words.push(initials);
    initials = ""; // a lone single-letter initial is ignored
  };
  for (const tok of tokens) {
    const bare = tok.replace(/\./g, "");
    if (!bare) continue;
    // "A.B.C." is one token of initials; "A", "B", "C" are consecutive initials
    if (/^([A-Z]\.)+[A-Z]?\.?$/.test(tok) && bare.length > 1) {
      flush();
      words.push(bare);
      continue;
    }
    if (bare.length === 1 && /[A-Z]/.test(bare)) {
      initials += bare;
      continue;
    }
    flush();
    if (IGNORED_WORDS.has(bare)) continue;
    if (countryIso === "ID" && bare === "PT" && words.length === 0) continue;
    if (countryIso === "RU" && ["JSC", "OAO", "OOO", "ZAO"].includes(bare)) continue;
    words.push(bare);
  }
  flush();
  return words;
}

/** Largest number on the street line; commas/hyphens between digits are ignored. */
export function addressNumber(street: string | null): { digits: string; mixed: boolean } {
  if (!street) return { digits: "", mixed: false };
  let best = "";
  let mixed = false;
  for (const tok of street.split(/\s+/)) {
    if (!/\d/.test(tok)) continue;
    if (/[A-Za-z]/.test(tok.replace(/(st|nd|rd|th)$/i, ""))) mixed = true; // e.g. "C7-C8", "8-Chome"
    const digits = tok.replace(/\D/g, "");
    if (digits && (best === "" || BigInt(digits) > BigInt(best))) best = digits;
  }
  return { digits: best.slice(0, 4), mixed };
}

export function cityCode(city: string | null): string {
  if (!city) return "";
  // Only a leading "The" is dropped ("The Hague" -> HAG). The full name ignore-list must
  // not apply here: "Di An" (Vietnam) would lose "An".
  const words = city.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words[0] === "THE" && words.length > 1) words.shift();
  return words.join("").slice(0, 3);
}

export function buildMid(input: MidInput): MidResult {
  const needsReview: string[] = [];
  const { countryIso } = input;
  if (!countryIso) return { mid: null, needsReview: ["Manufacturer country unknown"] };

  let cc = countryIso;
  if (countryIso === "CA") {
    const p = CANADA_PROVINCES[(input.province ?? "").toUpperCase().trim()];
    if (!p) return { mid: null, needsReview: ["Canadian manufacturer needs a province code (CBP does not accept CA)"] };
    cc = p;
  }

  const words = nameWords(input.name, countryIso);
  if (words.length === 0) return { mid: null, needsReview: ["Manufacturer name unreadable"] };
  const namePart = words.slice(0, 2).map((w) => w.slice(0, 3)).join("");

  const addr = addressNumber(input.streetLine);
  if (!input.streetLine) needsReview.push("No street address line; number group omitted");
  if (addr.mixed) needsReview.push(`Street line "${input.streetLine}" mixes letters and digits; confirm which number CBP expects`);

  const city = CITY_STATES.has(countryIso) ? cityCode(countryName(countryIso)) : cityCode(input.city);
  if (!city) needsReview.push("City missing");

  return { mid: (cc + namePart + addr.digits + city).slice(0, 15), needsReview };
}

function countryName(iso: string): string {
  return { SG: "Singapore", HK: "Hong Kong", MO: "Macau", MC: "Monaco", VA: "Vatican" }[iso] ?? iso;
}
