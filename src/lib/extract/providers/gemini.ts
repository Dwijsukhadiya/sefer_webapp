import { EXTRACTION_SYSTEM, EXTRACTION_USER, retryText } from "../prompt";
import type { ExtractionProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODELS = "gemini-3.8-flash,gemini-3.5-flash,gemini-2.5-flash";

interface GeminiResponse {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

/** Overload and rate-limit errors are transient: retry them with backoff. Anything else fails at once. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [2_000, 5_000];

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (!TRANSIENT.has(res.status) || attempt >= BACKOFF_MS.length) return res;
    await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
  }
}

/**
 * Gemini over plain REST (no SDK dependency). PDFs and images go inline; the response is
 * constrained to our JSON Schema with responseMimeType + responseJsonSchema.
 *
 * GEMINI_MODEL may list several models, comma-separated. If one stays overloaded after its
 * retries, the same request goes to the next. Non-transient errors (bad key, bad request)
 * fail immediately: falling back would only hide them.
 */
export function geminiProvider(jsonSchema: object, models = (process.env.GEMINI_MODEL ?? DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean)): ExtractionProvider {
  const key = process.env.GEMINI_API_KEY ?? "";
  return {
    name: `gemini:${models.join("|")}`,
    async transcribe(file, retryFeedback) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: file.mediaType, data: file.base64 } },
            { text: retryFeedback ? `${EXTRACTION_USER}\n\n${retryText(retryFeedback)}` : EXTRACTION_USER },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
      });

      let lastError = "no model configured";
      for (const model of models) {
        const res = await fetchWithRetry(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body,
        });
        const json = (await res.json()) as GeminiResponse;
        if (!res.ok) {
          lastError = `Gemini API ${res.status} (${model}): ${json.error?.message ?? "request failed"}`;
          if (TRANSIENT.has(res.status)) continue; // overloaded: try the next model
          throw new Error(lastError);
        }
        console.info(`[extract] ${file.name}: answered by ${model}`);
        const cand = json.candidates?.[0];
        const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        let output: unknown = null;
        try {
          output = JSON.parse(text);
        } catch {
          output = null; // reported as a schema failure and retried
        }
        return { output, truncated: cand?.finishReason === "MAX_TOKENS" };
      }
      throw new Error(`${lastError}. All configured Gemini models are overloaded; try again shortly.`);
    },
  };
}
