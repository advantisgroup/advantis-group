import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs functions against an in-memory backend built on the
    // same Web APIs (crypto.subtle, TextEncoder) Convex gives a real handler,
    // which is what edge-runtime provides and plain Node does not.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    env: {
      // `assertServerKey` compares against this on every `api*` function —
      // the same guard apps/api passes in production.
      CONVEX_SERVER_KEY: "test-server-key",
    },
  },
});
