import { NextResponse } from "next/server";
import { accessAllowed } from "@/lib/access";
import { ExtractionError, extractFile, hasExtractionKey } from "@/lib/extract/client";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;

function guessType(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const types: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  return types[ext] ?? "application/octet-stream";
}

/** multipart files → DocumentExtraction[]. The only route that calls the model. */
export async function POST(req: Request) {
  if (!accessAllowed(req.headers.get("x-access-code"), process.env.EXTRACT_PASSCODE)) {
    return NextResponse.json({ error: "An access code is required to read documents with the model. The sample shipment works without one.", needsCode: true }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the documents as multipart/form-data, one or more fields named \"files\"." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });

  if (!hasExtractionKey()) {
    return NextResponse.json({ error: "No model API key on the server. Set GEMINI_API_KEY or ANTHROPIC_API_KEY." }, { status: 500 });
  }

  const results = await Promise.allSettled(
    files.map(async (f) => {
      if (f.size > MAX_BYTES) throw new ExtractionError("File is larger than 20 MB", f.name);
      const base64 = Buffer.from(await f.arrayBuffer()).toString("base64");
      return extractFile({ name: f.name, mediaType: f.type || guessType(f.name), base64 });
    }),
  );

  const documents = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ file: files[i].name, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : [],
  );
  return NextResponse.json({ documents, errors });
}
