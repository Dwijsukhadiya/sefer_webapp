import { afterEach, describe, expect, it, vi } from "vitest";
import { shipment001 } from "../fixtures/shipment-001/extraction";
import { accessAllowed } from "../src/lib/access";
import { POST as entry } from "../src/app/api/entry/route";
import { POST as extract } from "../src/app/api/extract/route";

const post = (url: string, body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", body, headers });

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/entry", () => {
  it("answers malformed JSON with 400 and a reason, not 500", async () => {
    const res = await entry(post("/api/entry", "not json", { "content-type": "application/json" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be JSON/);
  });

  it("answers a body without documents with 400", async () => {
    expect((await entry(post("/api/entry", "{}", { "content-type": "application/json" }))).status).toBe(400);
  });

  it("builds the entry for valid documents", async () => {
    const res = await entry(post("/api/entry", JSON.stringify({ documents: shipment001 }), { "content-type": "application/json" }));
    expect(res.status).toBe(200);
    expect((await res.json()).xsd.valid).toBe(true);
  });
});

describe("POST /api/extract (no model is called in these tests)", () => {
  it("answers a non-multipart body with 400, not 500", async () => {
    const res = await extract(post("/api/extract", "{}", { "content-type": "application/json" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/multipart/);
  });

  it("answers a form without files with 400", async () => {
    const form = new FormData();
    form.append("note", "x");
    expect((await extract(post("/api/extract", form))).status).toBe(400);
  });

  it("asks for the access code when EXTRACT_PASSCODE is set", async () => {
    vi.stubEnv("EXTRACT_PASSCODE", "s3cret");
    const res = await extract(post("/api/extract", new FormData()));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ needsCode: true });
  });

  it("lets the right code through (then validates the body as usual)", async () => {
    vi.stubEnv("EXTRACT_PASSCODE", "s3cret");
    const res = await extract(post("/api/extract", new FormData(), { "x-access-code": "s3cret" }));
    expect(res.status).toBe(400); // past the gate; fails only because no files were sent
  });
});

describe("accessAllowed", () => {
  it("is open when no passcode is configured", () => expect(accessAllowed(null, undefined)).toBe(true));
  it("rejects a missing or wrong code", () => {
    expect(accessAllowed(null, "abc")).toBe(false);
    expect(accessAllowed("abd", "abc")).toBe(false);
    expect(accessAllowed("abcd", "abc")).toBe(false); // different lengths compare safely
  });
  it("accepts the right code", () => expect(accessAllowed("abc", "abc")).toBe(true));
});
