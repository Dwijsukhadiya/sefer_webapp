"use client";
import type { BrokerInputs } from "@/lib/netchb/brokerInputs";
import type { ShipmentFacts } from "@/lib/reconcile/types";
import { fmt } from "@/lib/util/money";
import { Badge, Card, inputCls } from "./ui";

interface Props {
  facts: ShipmentFacts;
  broker: BrokerInputs;
  onBroker: (b: BrokerInputs) => void;
}

const money = (c: number) => fmt(c, "").trim();

/** The lines as they will be entered: reconciled values, origin, MID, and the broker's HTS. */
export function EntryLines({ facts, broker, onBroker }: Props) {
  const c = facts.currency ?? "USD";
  const setHts = (key: string, v: string) => onBroker({ ...broker, htsOverrides: { ...broker.htsOverrides, [key]: v } });
  const setQty = (key: string, v: string) => {
    const q = { ...broker.quantityOverrides };
    if (v === "") delete q[key];
    else q[key] = Number(v);
    onBroker({ ...broker, quantityOverrides: q });
  };

  return (
    <Card
      title="Entry lines"
      step={4}
      aside={
        <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
          Entered value <b className="ml-1 font-mono text-white">{facts.enteredValueCents !== null ? fmt(facts.enteredValueCents, c) : "—"}</b>
        </span>
      }
    >
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-2">Line</th>
              <th className="pr-2">HTS (10-digit)</th>
              <th className="pr-2 text-right">Qty</th>
              <th className="pr-2 text-right">Printed</th>
              <th className="pr-2 text-right">Entered value</th>
              <th className="pr-2">Origin</th>
              <th>MID</th>
            </tr>
          </thead>
          <tbody className="zebra">
            {facts.lines.map((l) => {
              const mfr = facts.manufacturers.find((m) => m.key === l.manufacturerKey);
              const corrected = l.printedAmountCents !== null && l.amountCents !== l.printedAmountCents;
              const differs = l.enteredValueCents !== null && l.enteredValueCents !== l.printedAmountCents;
              return (
                <tr key={l.key} className="border-b border-slate-100 align-top">
                  <td className="py-2 pl-1 pr-2">
                    <div className="font-semibold text-slate-900">{l.sku ?? l.key}</div>
                    <div className="max-w-48 truncate text-slate-500" title={l.description}>{l.description}</div>
                    <div className="mt-1 flex gap-1">
                      {l.noCommercialValue && <Badge tone="violet">FOC</Badge>}
                      {l.assistCents > 0 && <Badge tone="amber">assist</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={`${inputCls} w-28 font-mono text-xs`}
                      placeholder={l.hsAsPrinted ?? "none"}
                      value={broker.htsOverrides[l.key] ?? ""}
                      onChange={(e) => setHts(l.key, e.target.value)}
                    />
                    {!l.htsNumber && <div className="mt-0.5 text-[10px] text-amber-700">printed: {l.hsAsPrinted ?? "—"}</div>}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <input
                      className={`${inputCls} w-20 text-right text-xs`}
                      type="number"
                      placeholder={String(l.quantity ?? "")}
                      value={broker.quantityOverrides[l.key] ?? ""}
                      onChange={(e) => setQty(l.key, e.target.value)}
                    />
                    <div className="mt-0.5 text-[10px] text-slate-400">{l.uom}</div>
                  </td>
                  <td className={`py-2 pr-2 text-right font-mono ${corrected ? "text-red-500 line-through decoration-red-400" : "text-slate-500"}`}>
                    {l.printedAmountCents !== null ? money(l.printedAmountCents) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <span className={`inline-block rounded px-1.5 py-0.5 font-mono ${differs ? "bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-emerald-200" : "text-slate-800"}`}>
                      {l.enteredValueCents !== null ? money(l.enteredValueCents) : "—"}
                    </span>
                    {corrected && <div className="mt-0.5 text-[10px] text-emerald-700">corrected</div>}
                    {l.assistCents > 0 && <div className="mt-0.5 text-[10px] text-amber-700">incl. assist {money(l.assistCents)}</div>}
                  </td>
                  <td className="py-2 pr-2">
                    <Badge tone={l.originSource === "line-level remark" ? "red" : "slate"}>{l.originIso ?? "?"}</Badge>
                  </td>
                  <td className="py-2 font-mono text-[11px]" title={mfr?.name}>
                    {mfr?.mid ?? <span className="text-red-600">missing</span>}
                    {mfr && mfr.midNeedsReview.length > 0 && <div className="text-[10px] text-amber-700">check</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Terms" v={facts.incoterm ?? "—"} />
        <Stat k="Freight + insurance (excluded)" v={fmt(facts.freightCents + facts.insuranceCents, c)} tone="text-slate-700" />
        <Stat k="Assists (added)" v={fmt(facts.assistsCents, c)} tone="text-amber-700" />
        <Stat k="Invoice total" v={facts.invoiceTotalCents !== null ? fmt(facts.invoiceTotalCents, c) : "—"} />
      </dl>
    </Card>
  );
}

const Stat = ({ k, v, tone = "text-slate-900" }: { k: string; v: string; tone?: string }) => (
  <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
    <dd className={`mt-0.5 font-mono text-sm ${tone}`}>{v}</dd>
  </div>
);
