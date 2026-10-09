import { readFileSync } from "node:fs";
import { TRANSCRIBE } from "../../src/lib/extract/client";
const data = readFileSync("fixtures/shipment-001/BMLVHCM26090418_House_BL.pdf").toString("base64");
async function run(model: string, thinking: object | null) {
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TRANSCRIBE.system }] },
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data } }, { text: TRANSCRIBE.user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: "application/json", responseJsonSchema: TRANSCRIBE.jsonSchema, ...(thinking ? { thinkingConfig: thinking } : {}) },
    }),
  });
  const b = await res.json();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (!res.ok) return console.log(`${model} ${JSON.stringify(thinking)} -> HTTP ${res.status} in ${secs}s: ${b.error?.message?.split("\n")[0]}`);
  const doc = JSON.parse(b.candidates[0].content.parts.map((p: { text?: string }) => p.text ?? "").join("")).documents[0];
  const u = b.usageMetadata ?? {};
  console.log(`${model} ${JSON.stringify(thinking)} -> ${secs}s  thoughtsTokens=${u.thoughtsTokenCount ?? 0} outTokens=${u.candidatesTokenCount}  master=${doc.masterBill}${doc.masterBill === "OPLUSGN260917735" ? " ✓" : " ✗"} container=${doc.containers?.[0]?.number} amendments=${doc.amendments?.length}`);
}
(async () => {
  const model = process.argv[2];
  await run(model, null);
  await run(model, { thinkingLevel: "low" });
})();
