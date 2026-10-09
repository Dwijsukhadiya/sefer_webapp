/** Country name → ISO 3166-1 alpha-2. Small on purpose: unknowns become findings, not guesses. */
const TABLE: Record<string, string> = {
  "VIETNAM": "VN", "VIET NAM": "VN", "VN": "VN",
  "HONG KONG": "HK", "HK": "HK", "HONG KONG SAR": "HK",
  "BANGLADESH": "BD", "BD": "BD",
  "CHINA": "CN", "PRC": "CN", "PEOPLE'S REPUBLIC OF CHINA": "CN", "CN": "CN",
  "INDIA": "IN", "IN": "IN",
  "UNITED STATES": "US", "USA": "US", "U.S.A.": "US", "U.S.A": "US", "US": "US", "UNITED STATES OF AMERICA": "US",
  "CANADA": "CA", "MEXICO": "MX",
  "INDONESIA": "ID", "THAILAND": "TH", "MALAYSIA": "MY", "PHILIPPINES": "PH", "CAMBODIA": "KH",
  "SRI LANKA": "LK", "PAKISTAN": "PK", "MYANMAR": "MM", "BURMA": "MM", "LAOS": "LA",
  "TAIWAN": "TW", "SOUTH KOREA": "KR", "KOREA": "KR", "REPUBLIC OF KOREA": "KR", "JAPAN": "JP",
  "SINGAPORE": "SG", "MACAU": "MO", "MACAO": "MO",
  "TURKEY": "TR", "TURKIYE": "TR", "ITALY": "IT", "GERMANY": "DE", "FRANCE": "FR", "SPAIN": "ES",
  "PORTUGAL": "PT", "UNITED KINGDOM": "GB", "UK": "GB", "NETHERLANDS": "NL", "BELGIUM": "BE",
  "POLAND": "PL", "ROMANIA": "RO", "EGYPT": "EG", "MOROCCO": "MA", "JORDAN": "JO", "ISRAEL": "IL",
  "BRAZIL": "BR", "PERU": "PE", "COLOMBIA": "CO", "GUATEMALA": "GT", "HONDURAS": "HN",
  "EL SALVADOR": "SV", "NICARAGUA": "NI", "DOMINICAN REPUBLIC": "DO", "HAITI": "HT",
  "AUSTRALIA": "AU", "NEW ZEALAND": "NZ", "KENYA": "KE", "ETHIOPIA": "ET", "SOUTH AFRICA": "ZA",
};

export function toIso2(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.toUpperCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  if (TABLE[k]) return TABLE[k];
  // Trailing ISO code, e.g. "CAT LAI, HCMC, VN"
  const tail = k.match(/,\s*([A-Z]{2})$/);
  if (tail && Object.values(TABLE).includes(tail[1])) return tail[1];
  // Last-resort: a known country name appears inside a longer string, e.g. "BINH DUONG, VIETNAM"
  const hit = Object.keys(TABLE)
    .filter((name) => name.length > 3 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(k))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? TABLE[hit] : null;
}

/** Find a country explicitly named as origin inside free text, e.g. "(Origin: Bangladesh)" or "Made in Bangladesh". */
export function originMentionedIn(text: string): string | null {
  const m = text.match(/(?:origin\s*[:\-]?\s*|made\s+in\s+|country\s+of\s+origin\s*[:\-]?\s*)([A-Za-z .']{2,40})/i);
  if (!m) return null;
  const candidate = m[1].replace(/[).,;].*$/, "").trim();
  return toIso2(candidate);
}
