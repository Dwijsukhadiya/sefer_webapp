/**
 * Date parsing that refuses to guess silently. "12/09/2026" is 12 Sep in most of
 * the world and 9 Dec in the US; we return every valid reading and let the
 * reconciliation layer pick using other dates on the shipment.
 */
const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

export interface ParsedDate {
  raw: string;
  candidates: string[]; // ISO yyyy-mm-dd, at least one if parseable
}

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
};

const year4 = (y: number) => (y < 100 ? 2000 + y : y);

export function parseDate(raw: string | null | undefined): ParsedDate | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();

  // 2026-09-12
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const d = iso(+m[1], +m[2], +m[3]);
    return d ? { raw, candidates: [d] } : null;
  }
  // 24-SEP-2026, 24 SEP 2026, 20-Sep-2026, 24SEP26
  m = s.match(/^(\d{1,2})[\s\-./]*([A-Z]{3,4})[A-Z]*[\s\-./,]*(\d{2,4})$/);
  if (m && MONTHS[m[2]]) {
    const d = iso(year4(+m[3]), MONTHS[m[2]], +m[1]);
    return d ? { raw, candidates: [d] } : null;
  }
  // SEP 24, 2026
  m = s.match(/^([A-Z]{3,4})[A-Z]*[\s.]+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) {
    const d = iso(+m[3], MONTHS[m[1]], +m[2]);
    return d ? { raw, candidates: [d] } : null;
  }
  // 12/09/2026: ambiguous between DD/MM and MM/DD
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = year4(+m[3]);
    const dmy = iso(y, +m[2], +m[1]);
    const mdy = iso(y, +m[1], +m[2]);
    const candidates = [...new Set([dmy, mdy].filter((x): x is string => !!x))];
    return candidates.length ? { raw, candidates } : null;
  }
  return null;
}

export const isAmbiguous = (p: ParsedDate | null) => !!p && p.candidates.length > 1;

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
