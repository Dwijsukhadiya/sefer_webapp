import { z } from "zod";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { SUPPORTED_MEDIA, type ExtractionProvider, type UploadedFile } from "./providers/types";
import { FileExtraction, type ExtractedDoc } from "./schema";

export type { UploadedFile } from "./providers/types";

// JSON Schema for the model's output, generated from the Zod source of truth.
const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(FileExtraction, { target: "draft-7" }) };
delete jsonSchema.$schema; // Gemini rejects the meta-schema key

export class ExtractionError extends Error {
  constructor(message: string, public file: string, public issues?: unknown) {
    super(message);
  }
}

/** EXTRACT_PROVIDER picks explicitly; otherwise whichever API key is configured (Gemini first). */
export function defaultProvider(): ExtractionProvider {
  const pick = process.env.EXTRACT_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "anthropic");
  return pick === "gemini" ? geminiProvider(jsonSchema) : anthropicProvider(jsonSchema);
}

export const hasExtractionKey = () => !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

/**
 * One model call per file. The output is validated with Zod; on a schema failure we retry
 * once, telling the model what was wrong. After that we surface the error, never guess.
 */
export async function extractFile(file: UploadedFile, provider = defaultProvider()): Promise<ExtractedDoc[]> {
  if (!SUPPORTED_MEDIA.includes(file.mediaType)) {
    throw new ExtractionError(`Unsupported file type ${file.mediaType}. Upload PDF or image files.`, file.name);
  }
  let feedback: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { output, truncated } = await provider.transcribe(file, feedback);
    const parsed = FileExtraction.safeParse(output);
    if (parsed.success) return parsed.data.documents.map((d) => ({ ...d, sourceFile: file.name }));
    if (truncated) throw new ExtractionError("Document too long to transcribe in one pass", file.name);
    feedback = output === null ? "Your reply was not valid JSON." : z.prettifyError(parsed.error);
    if (attempt === 1) throw new ExtractionError(`Extraction by ${provider.name} did not match the schema after a retry`, file.name, parsed.error.issues);
  }
  throw new ExtractionError("unreachable", file.name);
}
