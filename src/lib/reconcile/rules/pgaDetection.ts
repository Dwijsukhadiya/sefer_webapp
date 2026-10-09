import { lineLabel } from "../helpers";
import type { EntryLine, Finding, Rule } from "../types";

/**
 * Partner Government Agencies (FDA, FCC, EPA, ...) regulate some goods on top of CBP.
 * CBP decides which agency data an entry needs from PGA flags on the 10-digit HTS number,
 * which the documents rarely give (see HTS_INCOMPLETE). This rule is the early warning:
 * it reads the goods description and names the agencies whose territory it touches.
 * Each agency maps to the <xxx-items> block NetCHB's entry.xsd provides per tariff line.
 */
interface Agency {
  agency: string;
  xsd: string; // element in entry.xsd tariffType
  covers: string;
  pattern: RegExp;
}

export const AGENCIES: Agency[] = [
  {
    agency: "FDA", xsd: "fda-items", covers: "food, drugs, cosmetics, medical devices and radiation-emitting products",
    pattern: /\b(food(stuffs?)?|edible|snacks?|beverages?|(dietary )?supplements?|vitamins?|drugs?|pharmaceuticals?|medical|surgical|cosmetics?|skin ?care|lotions?|shampoos?|perfumes?|lasers?|x-?ray|sunglasses|contact lens(es)?)\b/i,
  },
  {
    agency: "FCC", xsd: "fcc-items", covers: "devices that emit radio frequency energy",
    pattern: /\b(radios?|bluetooth|wi-?fi|wireless|transmitters?|routers?|modems?|rfid|walkie[- ]talkies?|cellular|smart ?phones?|lte|5g)\b/i,
  },
  {
    agency: "EPA", xsd: "epa-items", covers: "pesticides, engines and vehicles (emissions), ozone-depleting refrigerants and TSCA chemicals",
    pattern: /\b(pesticides?|insecticides?|herbicides?|fungicides?|disinfectants?|antimicrobial|refrigerants?|engines?|generators?|chemicals?|solvents?)\b/i,
  },
  {
    agency: "NHTSA (DOT)", xsd: "dot-items", covers: "motor vehicles and motor vehicle equipment (tires, lamps, belts, helmets, child seats)",
    pattern: /\b(motor vehicles?|automobiles?|cars? parts?|tires?|tyres?|brake (pads?|discs?)|headlamps?|seat ?belts?|helmets?|child (car )?seats?)\b/i,
  },
  {
    agency: "APHIS (USDA)", xsd: "aphis-items", covers: "plants, seeds, soil, and animal products",
    pattern: /\b(seeds?|live plants?|nursery stock|bulbs?|soil|cut flowers?|meat|poultry|eggs?|dairy|hides?|raw wool)\b/i,
  },
  {
    agency: "FWS", xsd: "fws-items", covers: "wildlife and wildlife products, including real fur, feathers and exotic leathers",
    // "faux fur" is synthetic; colour words like "ivory" and garment "shells" are deliberately not keywords.
    pattern: /(?<!faux |fake |imitation )\b(fur|feathers?|python|crocodile|alligator|ostrich|snakeskin|lizard skin|stingray|exotic leather|seashells?|coral)\b/i,
  },
  {
    agency: "Lacey Act (APHIS)", xsd: "lacey-items", covers: "wood and other plant products, which need a Lacey Act declaration",
    pattern: /\b(wood(en)?|timber|lumber|plywood|bamboo|rattan|wicker|furniture|charcoal|paper|pulp)\b/i,
  },
  {
    agency: "CPSC", xsd: "cpsc-items", covers: "children's products, toys and products under consumer safety standards",
    pattern: /\b(toys?|children'?s|kids'?|infants?|baby|babies|toddlers?|cribs?|strollers?|pacifiers?|sleepwear)\b/i,
  },
  {
    agency: "TTB", xsd: "ttb-items", covers: "alcohol and tobacco",
    pattern: /\b(wines?|beers?|spirits|whiske?y|vodka|liquors?|tobacco|cigars?|cigarettes?|e-?cigarettes?|vapes?)\b/i,
  },
  {
    agency: "ATF", xsd: "atf-items", covers: "firearms, ammunition and explosives",
    pattern: /\b(firearms?|rifles?|pistols?|ammunition|ammo|explosives?|fireworks)\b/i,
  },
];

const textOf = (l: EntryLine) => [l.sku, l.description, l.fibre].filter(Boolean).join(" ");

export const pgaDetection: Rule = {
  id: "PGA_POSSIBLE",
  description: "Goods descriptions that suggest Partner Government Agency (FDA, FCC, EPA, ...) requirements",
  run: ({ facts }) => {
    const out: Finding[] = [];
    for (const line of facts.lines) {
      const text = textOf(line);
      const hits = AGENCIES.map((a) => ({ a, m: text.match(a.pattern) })).filter((h): h is { a: Agency; m: RegExpMatchArray } => !!h.m);
      if (!hits.length) continue;
      out.push({
        id: "PGA_POSSIBLE",
        severity: "warning",
        category: "pga",
        field: `lines[${line.key}].pga`,
        title: `${lineLabel(line)}: possible ${hits.map((h) => h.a.agency).join(", ")} requirements`,
        detail:
          hits.map((h) => `${h.a.agency} regulates ${h.a.covers} ("${h.m[0]}").`).join(" ") +
          " This is a keyword match on the description, not a determination: CBP flags agency data from the 10-digit HTS number, which is not known yet.",
        evidence: [{ source: "commercial_invoice", text }],
        resolution:
          `Once the line is classified, check the HTS number's PGA flags. File the agency message set (${hits.map((h) => `<${h.a.xsd}>`).join(", ")} in NetCHB's entry.xsd) or disclaim it if the agency does not regulate these goods.`,
        autoApplied: false,
      });
    }
    return out;
  },
};
