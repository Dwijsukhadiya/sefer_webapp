import { retryText } from "../prompt";
import type { ExtractionProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Each model has its own daily quota, so a chain of current flash models also multiplies
// free-tier capacity. (gemini-2.5-flash returns 404 for projects created after its retirement.)
const DEFAULT_MODELS = "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview";

interface GeminiResponse {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; details?: Array<{ violations?: Array<{ quotaId?: string }>; retryDelay?: string }> };
}

/** Overload, rate limits and server errors: worth trying elsewhere. Anything else fails at once. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/** A used-up daily quota will not recover today: skip that model for good. */
const dailyQuotaExhausted = (status: number, body: GeminiResponse) =>
  status === 429 && !!body.error?.details?.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? "")));

const retryDelay = (body: GeminiResponse) => {
  const secs = Number(body.error?.details?.find((d) => d.retryDelay)?.retryDelay?.replace(/s$/, ""));
  return Number.isFinite(secs) ? secs : null;
};

export class QuotaExhaustedError extends Error {}
export class OverloadedError extends Error {}

export interface GeminiOptions {
  /** Total time one transcription may take across all models; keep it under the platform limit. */
  deadlineMs?: number;
  /** Pause before a second pass over models that were only busy. */
  secondPassDelayMs?: number;
}

/**
 * Gemini over plain REST (no SDK dependency). PDFs and images go inline; the response is
 * constrained to the task's JSON Schema with responseMimeType + responseJsonSchema.
 *
 * GEMINI_MODEL may list several models, comma-separated. Under overload Gemini can take ~20 s
 * just to answer 503, so a busy model is not retried in place: the request moves straight to
 * the next model, and busy models get one more pass only if time remains. Models out of daily
 * quota or not offered to this key (404) are skipped. Other errors (bad key, bad request) fail
 * at once: falling back would only hide them. Everything stops before `deadlineMs`, with a
 * clear message instead of a platform timeout.
 */
export function geminiProvider(
  models = (process.env.GEMINI_MODEL ?? DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean),
  { deadlineMs = 270_000, secondPassDelayMs = 3_000 }: GeminiOptions = {},
): ExtractionProvider {
  const key = process.env.GEMINI_API_KEY ?? "";
  return {
    name: `gemini:${models.join("|")}`,
    async transcribe(file, task, retryFeedback) {
      const deadline = Date.now() + deadlineMs;
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

      let quotaResetSecs: number | null = null;
      let busy = models; // models worth (re)trying in this pass
      for (let pass = 0; pass < 2 && busy.length; pass++) {
        if (pass > 0) await new Promise((r) => setTimeout(r, Math.min(secondPassDelayMs, Math.max(0, deadline - Date.now()))));
        const stillBusy: string[] = [];
        for (const model of busy) {
          const remaining = deadline - Date.now();
          if (remaining < 5_000) break;
          let res: Response;
          let json: GeminiResponse;
          try {
            res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-goog-api-key": key },
              body,
              signal: AbortSignal.timeout(remaining),
            });
            json = (await res.json()) as GeminiResponse;
          } catch {
            stillBusy.push(model); // timed out or the connection dropped: treat as busy
            continue;
          }
          if (res.ok) {
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
          if (dailyQuotaExhausted(res.status, json)) {
            const d = retryDelay(json);
            if (d !== null) quotaResetSecs = Math.min(quotaResetSecs ?? d, d);
            continue; // done for today
          }
          if (res.status === 404) continue; // retired or not offered to this key
          if (TRANSIENT.has(res.status)) {
            stillBusy.push(model);
            continue;
          }
          throw new Error(`Gemini API ${res.status} (${model}): ${json.error?.message?.split("\n")[0] ?? "request failed"}`);
        }
        busy = stillBusy;
      }

      if (quotaResetSecs !== null && !busy.length) {
        throw new QuotaExhaustedError(
          `The Gemini API key's daily quota is used up for every available model (free tier: 20 requests per model per day). Try again in about ${Math.ceil(quotaResetSecs / 3600)} h, or enable billing on the Google AI project. The sample shipment still works.`,
        );
      }
      throw new OverloadedError(
        "Gemini is overloaded right now (free-tier requests are served last when demand spikes) and no model answered in time. Try again in a few minutes. The sample shipment still works.",
      );
    },
  };
}
