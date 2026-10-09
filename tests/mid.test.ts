import { describe, expect, it } from "vitest";
import { buildMid } from "../src/lib/reconcile/mid";

// Examples published in 19 CFR Part 102, Subpart B, Appendix.
const cfr: Array<[string, string | null, string, string, string]> = [
  ["La Vie de France", "243 Rue de la Payees", "Bremond", "FR", "FRLAVIE243BRE"],
  ["20th Century Technologies", "5 Ricardo Munoz, Suite 5880", "Caracas", "VE", "VE20TCEN5880CAR"],
  ["The Greenhouse", "45 Royal Crescent", "Birmingham", "US", "USGRE45BIR"],
  ["Carducci and Jones", "88 Canberra Avenue", "Sidney", "AU", "AUCARJON88SID"],
  ["Murla-Praxiteles Inc.", null, "Athens", "GR", "GRMURINCATH"],
  ["A.B.C. Company", "55-5 Hung To Road, P.O. Box 1234", "Kowloon", "HK", "HKABCCOM1234HON"],
];

describe("MID construction (CFR examples)", () => {
  it.each(cfr)("%s", (name, street, city, cc, expected) => {
    expect(buildMid({ name, streetLine: street, city, countryIso: cc }).mid).toBe(expected);
  });

  it("Canada uses province codes", () => {
    expect(buildMid({ name: "Huron Landmark", streetLine: "1840 Huron Road", city: "Windsor", countryIso: "CA", province: "ON" }).mid)
      .toBe("XOHURLAN1840WIN");
  });

  it("ignores a lone initial", () => {
    expect(buildMid({ name: "N. Minami & Co., Ltd.", streetLine: "2-6, 8-Chome Isogami-Dori", city: "Kobe", countryIso: "JP" }).mid)
      .toBe("JPMINCO26KOB");
  });
});

describe("MID for the sample shipment", () => {
  it("Saigon Phoenix: built but flagged (Lot C7-C8 mixes letters and digits)", () => {
    const r = buildMid({
      name: "SAIGON PHOENIX GARMENT JOINT STOCK COMPANY",
      streetLine: "Lot C7-C8, Road No. 9, Song Than 2 Industrial Park, Di An Ward",
      city: "Di An City", countryIso: "VN",
    });
    expect(r.mid).toBe("VNSAIPHO78DIA");
    expect(r.needsReview.length).toBeGreaterThan(0);
  });

  it("SP Garments Dhaka (Bangladesh sample line)", () => {
    expect(buildMid({ name: "SP Garments Dhaka Ltd.", streetLine: "Plot 41", city: "Gazipur", countryIso: "BD" }).mid)
      .toBe("BDSPGAR41GAZ");
  });
});
