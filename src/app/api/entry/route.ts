import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentExtraction } from "@/lib/extract/schema";
import { BrokerInputs } from "@/lib/netchb/brokerInputs";
import { buildEntry } from "@/lib/pipeline";

export const runtime = "nodejs";

const Body = z.object({
  documents: z.array(DocumentExtraction.extend({ sourceFile: z.string() })),
  brokerInputs: BrokerInputs.optional(),
});

/**
 * Extractions (possibly edited by the user) + broker inputs → findings and NetCHB XML.
 * Pure and deterministic: no model call, so every UI edit rebuilds the entry instantly.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const broker = parsed.data.brokerInputs ?? BrokerInputs.parse({});
  return NextResponse.json(await buildEntry(parsed.data.documents, broker));
}
