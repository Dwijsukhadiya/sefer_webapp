import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xmllint-wasm loads its .wasm file from node_modules at runtime; don't bundle it.
  serverExternalPackages: ["xmllint-wasm"],
  // Files read from disk at runtime that the bundler cannot see: the XSDs, and the WASM
  // binary xmllint-wasm loads from its own folder. Without these, validation fails on Vercel.
  outputFileTracingIncludes: {
    "/api/entry": ["./schemas/entry.xsd", "./schemas/data_type.xsd", "./node_modules/xmllint-wasm/xmllint.wasm"],
  },
};

export default nextConfig;
