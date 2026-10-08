/**
 * Large report uploads go straight from the browser into storage; the
 * ticket ties the stored file to the admin, the dashboard and a time window
 * so apps/api can't be pointed at some other stored file.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

async function setup() {
  const t = convexTest(schema, modules);
  const companyId = await t.run((ctx) =>
    ctx.db.insert("companies", {
      name: "Sales",
      slug: "sales",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const store = () =>
    t.run((ctx) => ctx.storage.store(new Blob([new TextEncoder().encode("a;b\n1;2")])));
  return { t, companyId, store };
}

describe("upload tickets", () => {
  test("a ticket is claimed once, by its admin, for a file stored after it", async () => {
    const { t, companyId, store } = await setup();
    const older = await store();
    const { ticketId } = await t.mutation(api.performance.import.apiCreateUploadTicket, {
      serverKey,
      clerkUserId: "admin",
      companyId,
    });
    const fresh = await store();
    const claim = (clerkUserId: string, storageId: typeof fresh) =>
      t.mutation(api.performance.import.apiClaimUploadTicket, {
        serverKey,
        ticketId,
        clerkUserId,
        companyId,
        storageId,
      });

    await expect(claim("someone-else", fresh)).rejects.toThrow("abgelaufen");
    await expect(claim("admin", older)).rejects.toThrow("nicht gefunden");
    const ok = await claim("admin", fresh);
    expect(ok.size).toBeGreaterThan(0);
    expect(ok.url).toBeTruthy();
    await expect(claim("admin", fresh)).rejects.toThrow("abgelaufen");
  });
});
