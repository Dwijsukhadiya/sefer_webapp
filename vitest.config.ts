import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Same "@/…" alias as tsconfig.json, so API route handlers can be tested directly.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
