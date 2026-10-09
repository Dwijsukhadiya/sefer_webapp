import { NextResponse } from "next/server";
import { ExtractionError, extractFile } from "@/lib/extract/client";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;

/** multipart files → DocumentExtraction[]. The only route that calls the model. */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });
  }
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });

  const results = await Promise.allSettled(
    files.map(async (f) => {
      if (f.size > MAX_BYTES) throw new ExtractionError("File is larger than 20 MB", f.name);
      const base64 = Buffer.from(await f.arrayBuffer()).toString("base64");
      const mediaType = f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      return extractFile({ name: f.name, mediaType, base64 });
    }),
  );

  const documents = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ file: files[i].name, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : [],
  );
  return NextResponse.json({ documents, errors });
}
