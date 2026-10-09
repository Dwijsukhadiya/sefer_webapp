import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EXTRACTION_SYSTEM, EXTRACTION_USER } from "./prompt";
import { FileExtraction, type ExtractedDoc } from "./schema";

const MODEL = process.env.EXTRACT_MODEL ?? "claude-sonnet-5-5";
const TOOL_NAME = "record_documents";

// JSON Schema for the tool input, generated from the Zod source of truth.
const inputSchema = z.toJSONSchema(FileExtraction, { target: "draft-7" }) as Anthropic.Tool.InputSchema;

export interface UploadedFile {
  name: string;
  mediaType: string; // application/pdf, image/png, image/jpeg
  base64: string;
}

export class ExtractionError extends Error {
  constructor(message: string, public file: string, public issues?: unknown) {
    super(message);
  }
}

function contentFor(file: UploadedFile): Anthropic.ContentBlockParam {
  if (file.mediaType === "application/pdf") {
    return { type: "document", title: file.name, source: { type: "base64", media_type: "application/pdf", data: file.base64 } };
  }
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mediaType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: file.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: file.base64 },
    };
  }
  throw new ExtractionError(`Unsupported file type ${file.mediaType}. Upload PDF or image files.`, file.name);
}

/**
 * One model call per file. The model is forced to answer through a tool whose input
 * schema is our Zod schema, then the result is validated again with Zod. On a schema
 * failure we retry once, telling the model what was wrong; after that we surface the error.
 */
export async function extractFile(file: UploadedFile, client = new Anthropic()): Promise<ExtractedDoc[]> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: [contentFor(file), { type: "text", text: EXTRACTION_USER }] },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM,
      tools: [{ name: TOOL_NAME, description: "Record the transcribed documents.", input_schema: inputSchema }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!call) throw new ExtractionError("Model returned no structured output", file.name);

    const parsed = FileExtraction.safeParse(call.input);
    if (parsed.success) return parsed.data.documents.map((d) => ({ ...d, sourceFile: file.name }));
    if (res.stop_reason === "max_tokens") throw new ExtractionError("Document too long to transcribe in one pass", file.name);

    messages.push(
      { role: "assistant", content: res.content },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: `Your output did not match the schema: ${z.prettifyError(parsed.error)}. Call ${TOOL_NAME} again with corrected output.`,
        }],
      },
    );
    if (attempt === 1) throw new ExtractionError("Extraction did not match the schema after a retry", file.name, parsed.error.issues);
  }
  throw new ExtractionError("unreachable", file.name);
}
