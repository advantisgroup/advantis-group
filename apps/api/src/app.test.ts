import { beforeAll, describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";

// Clerk only needs keys that parse; no request here carries a session, so it
// never has to reach Clerk to reject them.
process.env.CONVEX_SERVER_KEY = "test-server-key";
process.env.CLERK_SECRET_KEY = "sk_test_placeholder";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_test_${btoa("clerk.example.com$")}`;

let app: typeof import("./index.js").app;
beforeAll(async () => {
  ({ app } = await import("./index.js"));
}, 60_000);

const call = (path: string, init: RequestInit = {}) =>
  app.handle(new Request(`http://localhost${path}`, init));

describe("routes", () => {
  test("health answers", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test("internal routes refuse a missing server key", async () => {
    const res = await call("/internal/backups/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ok" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
  });

  test("internal routes refuse a wrong server key", async () => {
    const res = await call("/internal/backups/record", {
      method: "POST",
      headers: { "content-type": "application/json", "x-convex-server-key": "nope" },
      body: JSON.stringify({ status: "ok" }),
    });
    expect(res.status).toBe(401);
  });

  test("signedIn routes refuse a request without a session", async () => {
    const res = await call("/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
  });
});

describe("convex errors become the right status", () => {
  const context = { requestId: "r", method: "GET", path: "/x" };

  test.each([
    ["unauthenticated", 401, "unauthorized"],
    ["forbidden", 403, "forbidden"],
    ["vault_locked", 403, "forbidden"],
    ["not_found", 404, "not_found"],
    ["bad_request", 400, "bad_request"],
    ["conflict", 409, "conflict"],
  ] as const)("%s → %i", async (code, status, apiCode) => {
    const { reportApiFailure } = await import("./lib/errors.js");
    const failure = await reportApiFailure(new ConvexError({ code, message: "detail" }), context);
    expect(failure.status).toBe(status);
    expect(failure.code).toBe(apiCode);
    expect(failure.detail).toBe("detail");
  });

  test("anything else stays a 500 without leaking the message", async () => {
    const { reportApiFailure } = await import("./lib/errors.js");
    const failure = await reportApiFailure(
      new ConvexError({ code: "something_new", message: "internal detail" }),
      context,
    );
    expect(failure.status).toBe(500);
    expect(failure.message).not.toContain("internal detail");
  });
});
