import { z } from "zod";
import { EXTRACTION_SYSTEM, EXTRACTION_USER, IDENTIFIER_SYSTEM, IDENTIFIER_USER } from "./prompt";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { SUPPORTED_MEDIA, type ExtractionProvider, type ReadTask, type UploadedFile } from "./providers/types";
import { FileExtraction, IdentifierRead, type ExtractedDoc } from "./schema";
import { compareIdentifiers } from "./verify";

export type { UploadedFile } from "./providers/types";

/** JSON Schema for a model's answer, generated from the Zod source of truth. */
function jsonSchemaOf(schema: z.ZodType): object {
  const s: Record<string, unknown> = { ...z.toJSONSchema(schema, { target: "draft-7" }) };
  delete s.$schema; // Gemini rejects the meta-schema key
  return s;
}

export const TRANSCRIBE: ReadTask = { name: "record_documents", system: EXTRACTION_SYSTEM, user: EXTRACTION_USER, jsonSchema: jsonSchemaOf(FileExtraction) };
export const READ_IDENTIFIERS: ReadTask = { name: "record_identifiers", system: IDENTIFIER_SYSTEM, user: IDENTIFIER_USER, jsonSchema: jsonSchemaOf(IdentifierRead) };

export class ExtractionError extends Error {
  constructor(message: string, public file: string, public issues?: unknown) {
    super(message);
  }
}

const providerName = () => process.env.EXTRACT_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "anthropic");

/** EXTRACT_PROVIDER picks explicitly; otherwise whichever API key is configured (Gemini first). */
export function defaultProvider(): ExtractionProvider {
  return providerName() === "gemini" ? geminiProvider() : anthropicProvider();
}

/**
 * The identifier check is only worth its cost when it is independent: tested live, a second
 * read by the SAME model repeated the same dropped digit. So it runs only when VERIFY_MODEL
 * names a different model (ideally a stronger one).
 */
export function verifierProvider(): ExtractionProvider | null {
  const model = process.env.VERIFY_MODEL?.trim();
  if (!model) return null;
  return providerName() === "gemini" ? geminiProvider([model]) : anthropicProvider(model);
}

export const hasExtractionKey = () => !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

/** Full transcription. Validated with Zod; on a schema failure, retried once with the error. */
async function transcribe(file: UploadedFile, provider: ExtractionProvider): Promise<ExtractedDoc[]> {
  let feedback: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { output, truncated } = await provider.transcribe(file, TRANSCRIBE, feedback);
    const parsed = FileExtraction.safeParse(output);
    if (parsed.success) return parsed.data.documents.map((d) => ({ ...d, sourceFile: file.name }));
    if (truncated) throw new ExtractionError("Document too long to transcribe in one pass", file.name);
    feedback = output === null ? "Your reply was not valid JSON." : z.prettifyError(parsed.error);
    if (attempt === 1) throw new ExtractionError(`Extraction by ${provider.name} did not match the schema after a retry`, file.name, parsed.error.issues);
  }
  throw new ExtractionError("unreachable", file.name);
}

/** Independent second read of bill, container and document numbers. Null if it cannot run. */
async function readIdentifiers(file: UploadedFile, provider: ExtractionProvider): Promise<IdentifierRead | null> {
  try {
    const { output } = await provider.transcribe(file, READ_IDENTIFIERS, null);
    const parsed = IdentifierRead.safeParse(output);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * One file in, its documents out. With a verifier, the full transcription and a focused
 * second read of the identifiers run in parallel (no added latency); disagreements become
 * "uncertain" entries, never a silent choice.
 */
export async function extractFile(file: UploadedFile, provider = defaultProvider(), verifier = verifierProvider()): Promise<ExtractedDoc[]> {
  if (!SUPPORTED_MEDIA.includes(file.mediaType)) {
    throw new ExtractionError(`Unsupported file type ${file.mediaType}. Upload PDF or image files.`, file.name);
  }
  if (!verifier) return transcribe(file, provider);
  const [docs, second] = await Promise.all([transcribe(file, provider), readIdentifiers(file, verifier)]);
  return compareIdentifiers(docs, second);
}
