import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiProvider, QuotaExhaustedError } from "../src/lib/extract/providers/gemini";
import type { ReadTask } from "../src/lib/extract/providers/types";

const file = { name: "doc.pdf", mediaType: "application/pdf", base64: "" };
const task: ReadTask = { name: "t", system: "s", user: "u", jsonSchema: {} };

const ok = (output: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 });
const dailyQuota = () => new Response(JSON.stringify({
  error: { message: "You exceeded your current quota", details: [
    { violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { retryDelay: "29479s" },
  ] },
}), { status: 429 });
const status = (code: number, message = "error") => new Response(JSON.stringify({ error: { message } }), { status: code });

/** Stub fetch with one response per call and record which model each call went to. */
function stubFetch(...responses: Array<() => Response>) {
  const models: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    models.push(decodeURIComponent(url.split("/models/")[1].split(":")[0]));
    return responses.shift()!();
  }));
  return models;
}

afterEach(() => vi.unstubAllGlobals());

describe("Gemini model chain", () => {
  it("skips a model whose daily quota is used up, without retrying it", async () => {
    const models = stubFetch(dailyQuota, () => ok({ hello: 1 }));
    const r = await geminiProvider(["a", "b"]).transcribe(file, task, null);
    expect(r.output).toEqual({ hello: 1 });
    expect(models).toEqual(["a", "b"]); // one call to "a", no backoff retries
  });

  it("skips a model that is not available to this key (404)", async () => {
    const models = stubFetch(() => status(404, "no longer available to new users"), () => ok({ x: 1 }));
    await geminiProvider(["retired", "current"]).transcribe(file, task, null);
    expect(models).toEqual(["retired", "current"]);
  });

  it("explains a fully used-up quota in plain words, with the reset time", async () => {
    stubFetch(dailyQuota, dailyQuota);
    const err = await geminiProvider(["a", "b"]).transcribe(file, task, null).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExhaustedError);
    expect(err.message).toMatch(/daily quota is used up/);
    expect(err.message).toMatch(/about 9 h/);
    expect(err.message).toMatch(/sample shipment still works/);
  });

  it("fails at once on a real error (bad key) instead of hiding it behind fallbacks", async () => {
    const models = stubFetch(() => status(400, "API key not valid"), () => ok({}));
    await expect(geminiProvider(["a", "b"]).transcribe(file, task, null)).rejects.toThrow(/API key not valid/);
    expect(models).toEqual(["a"]);
  });
});
