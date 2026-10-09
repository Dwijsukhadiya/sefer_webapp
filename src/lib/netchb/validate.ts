import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateXML } from "xmllint-wasm";

export interface XsdResult {
  valid: boolean;
  errors: string[];
}

const SCHEMA_DIR = join(process.cwd(), "schemas");
let cache: Promise<{ entry: string; dataType: string }> | null = null;
const schemas = () =>
  (cache ??= Promise.all([readFile(join(SCHEMA_DIR, "entry.xsd"), "utf8"), readFile(join(SCHEMA_DIR, "data_type.xsd"), "utf8")])
    .then(([entry, dataType]) => ({ entry, dataType })));

/**
 * Validate against NetCHB's published entry.xsd (local copy; its import of data_type.xsd
 * is repointed to the local file, see schemas/SOURCE.md). Runs libxml2 compiled to WASM.
 */
export async function validateEntryXml(xml: string): Promise<XsdResult> {
  const { entry, dataType } = await schemas();
  const r = await validateXML({
    xml: { fileName: "entry.xml", contents: xml },
    schema: { fileName: "entry.xsd", contents: entry },
    preload: { fileName: "data_type.xsd", contents: dataType },
  });
  return { valid: r.valid, errors: r.errors.map((e) => (e.loc ? `line ${e.loc.lineNumber}: ${e.message}` : e.message)) };
}
