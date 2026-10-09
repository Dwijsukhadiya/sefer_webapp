import { retryText } from "../prompt";
import type { ExtractionProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Each model has its own daily quota, so a chain of current flash models also multiplies
// free-tier capacity. (gemini-2.5-flash returns 404 for projects created after its retirement.)
const DEFAULT_MODELS = "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash";

interface GeminiResponse {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; details?: Array<{ violations?: Array<{ quotaId?: string }>; retryDelay?: string }> };
}

/** Overload and per-minute rate limits are transient: retry with backoff. Anything else fails at once. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [2_000, 5_000];

/** A used-up daily quota will not recover by retrying: skip straight to the next model. */
const dailyQuotaExhausted = (status: number, body: GeminiResponse) =>
  status === 429 && !!body.error?.details?.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? "")));

const retryDelay = (body: GeminiResponse) => {
  const secs = Number(body.error?.details?.find((d) => d.retryDelay)?.retryDelay?.replace(/s$/, ""));
  return Number.isFinite(secs) ? secs : null;
};

async function call(url: string, init: RequestInit): Promise<{ res: Response; json: GeminiResponse }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const json = (await res.json()) as GeminiResponse;
    if (res.ok || !TRANSIENT.has(res.status) || dailyQuotaExhausted(res.status, json) || attempt >= BACKOFF_MS.length) return { res, json };
    await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
  }
}

export class QuotaExhaustedError extends Error {}

/**
 * Gemini over plain REST (no SDK dependency). PDFs and images go inline; the response is
 * constrained to the task's JSON Schema with responseMimeType + responseJsonSchema.
 *
 * GEMINI_MODEL may list several models, comma-separated. If one is overloaded, out of daily
 * quota or not available to this key, the same request goes to the next. Other errors (bad
 * key, bad request) fail immediately: falling back would only hide them.
 */
export function geminiProvider(models = (process.env.GEMINI_MODEL ?? DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean)): ExtractionProvider {
  const key = process.env.GEMINI_API_KEY ?? "";
  return {
    name: `gemini:${models.join("|")}`,
    async transcribe(file, task, retryFeedback) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: task.system }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: file.mediaType, data: file.base64 } },
            { text: retryFeedback ? `${task.user}\n\n${retryText(retryFeedback)}` : task.user },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: "application/json", responseJsonSchema: task.jsonSchema },
      });

      let lastError = "no model configured";
      let quotaResetSecs: number | null = null;
      let allQuota = true;
      for (const model of models) {
        const { res, json } = await call(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body,
        });
        if (!res.ok) {
          lastError = `Gemini API ${res.status} (${model}): ${json.error?.message?.split("\n")[0] ?? "request failed"}`;
          if (dailyQuotaExhausted(res.status, json)) {
            const d = retryDelay(json);
            if (d !== null) quotaResetSecs = Math.min(quotaResetSecs ?? d, d);
            continue; // this model is done for today: try the next one
          }
          allQuota = false;
          if (TRANSIENT.has(res.status)) continue; // overloaded: try the next model
          if (res.status === 404) continue; // model retired or not offered to this key: try the next
          throw new Error(lastError);
        }
        console.info(`[${task.name}] ${file.name}: answered by ${model}`);
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
      if (allQuota) {
        const when = quotaResetSecs === null ? "when the quota resets" : `in about ${Math.ceil(quotaResetSecs / 3600)} h`;
        throw new QuotaExhaustedError(
          `The Gemini API key's daily quota is used up for every configured model (free tier: 20 requests per model per day). Try again ${when}, or enable billing on the Google AI project. The sample shipment still works.`,
        );
      }
      throw new Error(`${lastError}. All configured Gemini models are overloaded; try again shortly.`);
    },
  };
}
