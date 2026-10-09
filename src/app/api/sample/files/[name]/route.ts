import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "fixtures", "shipment-001");
const TYPES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

/**
 * Serves the sample shipment's source PDFs to the document viewer. Only a file whose name
 * exactly matches one in the fixture folder is returned; the request never builds a path.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const files = await readdir(DIR);
  const match = files.find((f) => f === name);
  const type = match ? TYPES[match.split(".").pop()?.toLowerCase() ?? ""] : undefined;
  if (!match || !type) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await readFile(join(DIR, match))), {
    headers: { "content-type": type, "content-disposition": `inline; filename="${match}"`, "cache-control": "public, max-age=3600" },
  });
}
