import { usPortCode } from "../../netchb/codes";
import { docsOf } from "../facts";
import { allNotes, ev } from "../helpers";
import type { Finding, Rule } from "../types";

/** ISO 6346 container check digit. Returns null if the format is not a container number. */
export function containerCheckDigitValid(raw: string): boolean | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{7}$/.test(s)) return null;
  const val: Record<string, number> = {};
  let n = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") { if (n % 11 === 0) n++; val[ch] = n++; }
  const total = [...s.slice(0, 10)].reduce((a, ch, i) => a + (/\d/.test(ch) ? +ch : val[ch]) * 2 ** i, 0);
  return (total % 11) % 10 === +s[10];
}

export const transport: Rule = {
  id: "TRANSPORT",
  description: "Bills of lading, SCACs, containers (incl. amendments), port codes, ISF",
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const tr = docsOf(docs, "bill_of_lading", "air_waybill")[0];

    if (!tr) {
      out.push({
        id: "TRANSPORT_DOC_MISSING", severity: "error", category: "transport", field: "billOfLading",
        title: "No bill of lading or air waybill uploaded",
        detail: "Bill numbers, carrier SCAC, port of unlading and arrival date come from the transport document.",
        evidence: [], resolution: "Upload the B/L or AWB, or enter the manifest details by hand.", autoApplied: false,
      });
      return out;
    }

    if (facts.houseBill && facts.masterBill) {
      out.push({
        id: "HOUSE_AND_MASTER_BILL", severity: "info", category: "transport", field: "bills",
        title: `House bill ${facts.houseBill} (${facts.houseScac ?? "?"}) moves under master bill ${facts.masterBill} (${facts.masterScac ?? "?"})`,
        detail: "An NVOCC issued this bill. The entry must reference the bill as it appears on the carrier's manifest; for most ocean entries that is the house bill, prefixed with the NVOCC's SCAC, with the master bill for context.",
        evidence: [ev(tr, `B/L No. ${facts.houseBill}`), ev(tr, `MBL: ${facts.masterBill}`)],
        resolution: "Both bills are carried in the XML. Broker should confirm which bill was filed in AMS (the B/L says AMS was filed by the NVOCC).",
        autoApplied: true,
      });
    } else if (facts.houseBill && !facts.masterBill && tr.parties.some((p) => p.role === "nvocc")) {
      out.push({
        id: "MASTER_BILL_MISSING", severity: "warning", category: "transport", field: "masterBill",
        title: "NVOCC house bill without a master bill number",
        detail: "Cargo release normally needs the master bill as well.", evidence: [ev(tr, `B/L No. ${facts.houseBill}`)],
        resolution: "Ask the NVOCC for the master bill number.", autoApplied: false,
      });
    }

    // Containers, including amended numbers
    for (const c of facts.containers) c.checkDigitValid = containerCheckDigitValid(c.number);
    for (const a of tr.amendments) {
      const isContainer = /container/i.test(a.field) || containerCheckDigitValid(a.original) !== null;
      const origOk = isContainer ? containerCheckDigitValid(a.original) : null;
      const newOk = isContainer && a.replacement ? containerCheckDigitValid(a.replacement) : null;
      const pickNew = newOk === true && origOk === false;
      if (pickNew && a.replacement) {
        const c = facts.containers.find((x) => x.number === a.original.replace(/\s/g, ""));
        if (c) c.number = a.replacement.replace(/\s/g, "");
      }
      out.push({
        id: "DOCUMENT_AMENDED", severity: pickNew ? "warning" : "error", category: "transport", field: a.field,
        title: `${a.field} amended on the ${tr.docType.replace(/_/g, " ")}: "${a.original}" ${a.kind.replace(/_/g, " ")}${a.replacement ? `, "${a.replacement}" written in` : ""}`,
        detail: isContainer
          ? `ISO 6346 check digit: original ${origOk ? "valid" : "INVALID"}, replacement ${newOk === null ? "n/a" : newOk ? "valid" : "INVALID"}.` +
            (pickNew ? " The original number cannot be a real container; the handwritten correction is consistent." : " The check digit does not settle which is correct.")
          : "A hand amendment on a transport document may not match what the carrier transmitted.",
        evidence: [ev(tr, `${a.original} → ${a.replacement ?? "(none)"}`)],
        resolution: pickNew
          ? `Using ${a.replacement}. Broker should confirm against the carrier's manifest (arrival notice), since an unendorsed hand correction is not authoritative.`
          : "Broker must confirm the number with the carrier before filing.",
        autoApplied: pickNew,
      });
    }
    for (const c of facts.containers) {
      if (c.checkDigitValid === false) {
        out.push({
          id: "CONTAINER_CHECK_DIGIT", severity: "error", category: "transport", field: "containers",
          title: `Container ${c.number} fails the ISO 6346 check digit`, detail: "This is probably a typo.",
          evidence: [ev(tr, c.number)], resolution: "Confirm with the carrier.", autoApplied: false,
        });
      }
    }

    // Port of entry
    const port = usPortCode(facts.portOfDischarge);
    out.push({
      id: port ? "PORT_CODE_DERIVED" : "PORT_CODE_UNKNOWN",
      severity: port ? "info" : "error", category: "transport", field: "usPortCode",
      title: port ? `Port of unlading ${facts.portOfDischarge} → CBP port code ${port.code}` : `No CBP port code for "${facts.portOfDischarge ?? "unknown"}"`,
      detail: port
        ? `Port of entry is assumed to be the port of unlading.${facts.placeOfDelivery ? ` Final delivery is ${facts.placeOfDelivery}; if the cargo moves in-bond, the entry port changes.` : ""}`
        : "Port code is required.",
      evidence: [ev(tr, `Port of discharge: ${facts.portOfDischarge ?? "?"}`)],
      resolution: port ? "Broker should confirm the port of entry." : "Broker must supply the Schedule D port code.",
      autoApplied: !!port,
    });

    const isf = allNotes([tr]).find((n) => /ISF/i.test(n.text));
    if (facts.mode === "ocean") {
      out.push({
        id: "ISF_CHECK", severity: "warning", category: "completeness", field: "isf",
        title: isf ? `ISF: "${isf.text}"` : "No evidence an ISF (10+2) was filed",
        detail: "Ocean shipments need an Importer Security Filing at least 24 hours before loading. Late or missing ISF can carry a USD 5,000 penalty.",
        evidence: isf ? [ev(tr, isf.text)] : [],
        resolution: "Broker should confirm the ISF transaction number before filing the entry.", autoApplied: false,
      });
    }
    return out;
  },
};
