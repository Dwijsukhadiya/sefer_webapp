# Adding a reconciliation rule

A rule is a pure function from the shipment to a list of findings. Adding one is three steps: **one file, one registry line, one test**. The example below was run against the real codebase (typecheck clean, all tests passing) before being written up here.

The example rule warns when the invoice is dated more than 90 days before the goods were exported.

> **Why "before export" and not "older than today"?** `/api/entry` is a pure function of `(documents, broker inputs)`. A rule that reads the clock would give different answers on different days for the same shipment, and its test would start failing in 90 days. Compare against a date in the shipment instead.

## 1. Write the rule: `src/lib/reconcile/rules/staleInvoice.ts`

```ts
import { daysBetween } from "../../util/dates";
import { docsOf } from "../facts";
import { ev } from "../helpers";
import type { Finding, Rule } from "../types";

const MAX_DAYS = 90;

/**
 * An invoice dated long before the goods shipped may have been superseded (price
 * changes, re-issued invoices). Compared with the export date, not "today", so the
 * result never depends on when the entry is built.
 */
export const staleInvoice: Rule = {
  id: "STALE_INVOICE",
  description: `Invoice dated more than ${MAX_DAYS} days before export`,
  run: ({ docs, facts }) => {
    const out: Finding[] = [];
    const { invoiceDate, exportDate } = facts;
    if (!invoiceDate || !exportDate) return out; // nothing to compare; other rules flag missing dates
    const age = daysBetween(invoiceDate, exportDate);
    if (age <= MAX_DAYS) return out;

    const inv = docsOf(docs, "commercial_invoice")[0];
    out.push({
      id: "STALE_INVOICE",
      severity: "warning",
      category: "dates",
      field: "invoiceDate",
      title: `Invoice is dated ${age} days before the goods were exported`,
      detail: `Invoice date ${invoiceDate}, export date ${exportDate}. An invoice this old may not reflect the price actually paid.`,
      evidence: inv ? [ev(inv, `Invoice date: ${inv.documentDateRaw ?? "?"}`)] : [],
      resolution: "Broker should confirm with the importer that this is the current invoice.",
      autoApplied: false,
    });
    return out;
  },
};
```

What each part is for:

| Piece | Meaning |
|---|---|
| `ctx.facts` | The shipment as reconciled so far (`ShipmentFacts` in `types.ts`): dates, parties, lines, values. |
| `ctx.docs` | The raw extractions, for quoting evidence. |
| `severity` | `error` blocks filing until resolved, `warning` needs a look, `info` explains something we did. |
| `evidence` | Short quotes from the documents; `ev(doc, text)` tags them with the source document. |
| `autoApplied` | `true` only if the rule **changed a value** in `facts`. Then the detail must show the before and after values. This rule only flags, so `false`. |

Rules must be written against what documents *mean*, not this sample's layout. Bail out quietly (`return out`) when the data you need is missing; other rules already report missing data.

## 2. Register it: `src/lib/reconcile/index.ts`

```ts
import { staleInvoice } from "./rules/staleInvoice";

export const RULES: Rule[] = [
  // ...
  dates, // resolves the invoice date that staleInvoice reads
  staleInvoice,
  marking,
  multipleInvoices,
];
```

**Order matters** when a rule reads something another rule sets. `dates` resolves an ambiguous invoice date like `12/09/2026` (it could be 12 Sep or 9 Dec) using the export date, so `staleInvoice` must run after it. A rule that throws never takes down the entry: `reconcile()` catches it and reports a `RULE_FAILED` warning.

## 3. Test it: `tests/reconcile.test.ts`

Test both directions: it fires when it should, and stays quiet on the clean case.

```ts
describe("STALE_INVOICE", () => {
  it("stays quiet on the sample (invoice 12 days before export)", () => {
    expect(ids(run())).not.toContain("STALE_INVOICE");
  });

  it("warns when the invoice predates export by more than 90 days", () => {
    const docs = structuredClone(shipment001);
    docs[0].documentDateRaw = "01-MAR-2026"; // unambiguous, 207 days before 24-SEP-2026
    const f = reconcile(docs).findings.find((x) => x.id === "STALE_INVOICE")!;
    expect(f.severity).toBe("warning");
    expect(f.title).toMatch(/207 days/);
  });
});
```

`run()` and `ids()` are helpers already defined at the top of the test file. `shipment001` is the hand-transcribed fixture: clone it and change one field to build the case you need.

## 4. Check

```bash
npx tsc --noEmit
npm test
```

The finding then appears in the UI automatically: Findings panel, progress bar counts, and nothing else to wire. If the rule changes a value in `facts`, the XML reflects it too, since `/api/entry` rebuilds from the facts.

## Other rules worth reading first

- `rules/lineArithmetic.ts`: changes a value (`autoApplied: true`) only when the subtotal proves which number is right.
- `rules/quantityByStyle.ts`: compares two documents line by line.
- `rules/multipleInvoices.ts`: the smallest rule in the repo.
