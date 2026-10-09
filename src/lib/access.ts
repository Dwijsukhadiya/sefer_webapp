import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional gate for the one endpoint that spends model quota. When EXTRACT_PASSCODE is set,
 * callers must send it in the x-access-code header. Compared in constant time so the code
 * cannot be guessed character by character from response timings.
 */
export function accessAllowed(given: string | null, expected: string | undefined): boolean {
  if (!expected) return true; // no passcode configured: open, as in local development
  if (!given) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
