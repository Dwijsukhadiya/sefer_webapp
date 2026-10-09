"use client";
import type { ReactNode } from "react";
import type { BrokerInputs, MissingField } from "@/lib/netchb/brokerInputs";
import type { ShipmentFacts } from "@/lib/reconcile/types";
import { Badge, Card, Field, inputCls } from "./ui";

interface Props {
  value: BrokerInputs;
  onChange: (b: BrokerInputs) => void;
  facts: ShipmentFacts | null;
  missing: MissingField[];
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <legend className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
        <span className="h-px w-3 bg-slate-300" />
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** What only the broker knows. Every change rebuilds the entry with no model call. */
export function BrokerForm({ value: b, onChange, facts, missing }: Props) {
  const set = <K extends keyof BrokerInputs>(k: K, v: BrokerInputs[K]) => onChange({ ...b, [k]: v });
  const text = (k: "filerCode" | "entryNumber" | "importerNumber" | "ultimateConsigneeTaxId" | "suretyCode" | "portOfEntry" | "entryDate" | "referenceNumber", placeholder?: string) => (
    <input className={inputCls} value={b[k] ?? ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
  );
  const required = missing.filter((m) => m.required);

  return (
    <Card
      title="Broker inputs"
      step={3}
      aside={required.length ? <Badge tone="red">{required.length} required still open</Badge> : <Badge tone="green">✓ complete</Badge>}
    >
      <div className="space-y-4">
        <Group title="Filing info">
          <Field label="Filer code" hint="Blank = NetCHB numbers the entry">{text("filerCode", "ABC")}</Field>
          <Field label="Entry number (7 digits)">{text("entryNumber", "1234567")}</Field>
          <Field label="Entry date" hint={facts?.arrivalDate ? `Default: ETA ${facts.arrivalDate}` : undefined}>
            <input type="date" className={inputCls} value={b.entryDate ?? ""} onChange={(e) => set("entryDate", e.target.value)} />
          </Field>
          <Field label="Broker reference (max 9)">{text("referenceNumber")}</Field>
        </Group>

        <Group title="Parties">
          <Field label="Importer of record">
            <select className={inputCls} value={b.importerOverride} onChange={(e) => set("importerOverride", e.target.value as BrokerInputs["importerOverride"])}>
              <option value="">Auto: {facts?.importer?.name ?? "—"}</option>
              {facts?.buyer && <option value="buyer">Buyer: {facts.buyer.name}</option>}
              {facts?.consignee && <option value="consignee">B/L consignee: {facts.consignee.name}</option>}
            </select>
          </Field>
          <Field label="Importer IRS/EIN number" hint="NN-NNNNNNNXX">{text("importerNumber", "12-3456789AB")}</Field>
          <Field label="Ultimate consignee tax ID" hint="Blank = same as importer">{text("ultimateConsigneeTaxId")}</Field>
          <Field label="Related party?">
            <select className={inputCls} value={b.relatedParty} onChange={(e) => set("relatedParty", e.target.value as BrokerInputs["relatedParty"])}>
              <option value="">Not declared</option>
              <option value="N">No</option>
              <option value="Y">Yes</option>
            </select>
          </Field>
        </Group>

        <Group title="Bond">
          <Field label="Bond type">
            <select className={inputCls} value={b.bondType} onChange={(e) => set("bondType", e.target.value as BrokerInputs["bondType"])}>
              <option value="">Not set</option>
              <option value="continuous">Continuous (08)</option>
              <option value="single">Single transaction (09)</option>
            </select>
          </Field>
          <Field label="Surety code">{text("suretyCode", "036")}</Field>
        </Group>

        <Group title="Transport">
          <Field label="Port of entry" hint={facts?.usPortCode ? `Derived: ${facts.usPortCode}` : undefined}>{text("portOfEntry", facts?.usPortCode ?? "")}</Field>
          <Field label="Container number(s)" hint={facts?.containers.length ? `Derived: ${facts.containers.map((c) => c.number).join(", ")}` : undefined}>
            <input
              className={`${inputCls} font-mono`}
              value={(b.containerNumbers ?? []).join(", ")}
              placeholder={facts?.containers.map((c) => c.number).join(", ")}
              onChange={(e) => set("containerNumbers", e.target.value.split(/[,\s]+/).filter(Boolean))}
            />
          </Field>
        </Group>
      </div>

      {missing.length > 0 && (
        <div className="mt-5 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200/70">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">No document can supply these</h3>
          <ul className="space-y-1.5">
            {missing.map((m) => (
              <li key={m.field} className="flex gap-2 text-xs">
                <span className="w-16 shrink-0"><Badge tone={m.required ? "red" : "slate"}>{m.required ? "required" : "optional"}</Badge></span>
                <span><span className="font-semibold text-slate-700">{m.label}.</span> <span className="text-slate-500">{m.reason}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
