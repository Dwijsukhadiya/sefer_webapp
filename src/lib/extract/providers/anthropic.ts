import Anthropic from "@anthropic-ai/sdk";
import { retryText } from "../prompt";
import type { ExtractionProvider, UploadedFile } from "./types";

function contentFor(file: UploadedFile): Anthropic.ContentBlockParam {
  if (file.mediaType === "application/pdf") {
    return { type: "document", title: file.name, source: { type: "base64", media_type: "application/pdf", data: file.base64 } };
  }
  return { type: "image", source: { type: "base64", media_type: file.mediaType as "image/png" | "image/jpeg" | "image/webp", data: file.base64 } };
}

/** Claude with native PDF input, forced to answer through a tool whose input schema is the task's schema. */
export function anthropicProvider(model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"): ExtractionProvider {
  const client = new Anthropic();
  return {
    name: `anthropic:${model}`,
    async transcribe(file, task, retryFeedback) {
      const res = await client.messages.create({
        model,
        max_tokens: 16000,
        system: task.system,
        tools: [{ name: task.name, description: "Record what the file says.", input_schema: task.jsonSchema as Anthropic.Tool.InputSchema }],
        tool_choice: { type: "tool", name: task.name },
        messages: [{
          role: "user",
          content: [contentFor(file), { type: "text", text: retryFeedback ? `${task.user}\n\n${retryText(retryFeedback)}` : task.user }],
        }],
      });
      const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      return { output: call?.input ?? null, truncated: res.stop_reason === "max_tokens" };
    },
  };
}
