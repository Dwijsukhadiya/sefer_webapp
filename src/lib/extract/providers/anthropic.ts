import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_SYSTEM, EXTRACTION_USER, retryText } from "../prompt";
import type { ExtractionProvider, UploadedFile } from "./types";

const TOOL_NAME = "record_documents";

function contentFor(file: UploadedFile): Anthropic.ContentBlockParam {
  if (file.mediaType === "application/pdf") {
    return { type: "document", title: file.name, source: { type: "base64", media_type: "application/pdf", data: file.base64 } };
  }
  return { type: "image", source: { type: "base64", media_type: file.mediaType as "image/png" | "image/jpeg" | "image/webp", data: file.base64 } };
}

/** Claude with native PDF input, forced to answer through a tool whose input schema is our Zod schema. */
export function anthropicProvider(inputSchema: object, model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"): ExtractionProvider {
  const client = new Anthropic();
  return {
    name: `anthropic:${model}`,
    async transcribe(file, retryFeedback) {
      const res = await client.messages.create({
        model,
        max_tokens: 16000,
        system: EXTRACTION_SYSTEM,
        tools: [{ name: TOOL_NAME, description: "Record the transcribed documents.", input_schema: inputSchema as Anthropic.Tool.InputSchema }],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{
          role: "user",
          content: [contentFor(file), { type: "text", text: retryFeedback ? `${EXTRACTION_USER}\n\n${retryText(retryFeedback)}` : EXTRACTION_USER }],
        }],
      });
      const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      return { output: call?.input ?? null, truncated: res.stop_reason === "max_tokens" };
    },
  };
}
