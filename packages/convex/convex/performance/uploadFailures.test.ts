/** Failed uploads: recorded with the uploader's name, listed newest first
 * for admins only, old ones dropped. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { FAILURE_WINDOW_MS } from "./uploadFailures";

async function setup() {
  const t = convexTest(schema, modules);
  const companyId = await t.run(async (ctx) => {
    const now = Date.now();
    for (const [clerkUserId, role, firstName] of [
      ["admin", "admin", "Jörg"],
      ["anna", "employee", "Anna"],
    ] as const) {
      await ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName,
        lastName: "Test",
        role,
        status: "active",
        external: false,
        createdAt: now,
      });
    }
    return ctx.db.insert("companies", {
      name: "Advantis",
      slug: "advantis",
      createdAt: now,
      updatedAt: now,
    });
  });
  return { t, companyId };
}

describe("upload failures", () => {
  test("recorded and listed for admins, with old entries dropped", async () => {
    const { t, companyId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("performanceUploadFailures", {
        companyId,
        filename: "alt.xlsx",
        message: "alt",
        uploadedBy: "Jörg Test",
        at: Date.now() - FAILURE_WINDOW_MS - 1000,
      });
    });
    const admin = t.withIdentity({ subject: "admin" });
    await admin.mutation(api.performance.uploadFailures.record, {
      companyId,
      filename: "Leads.xlsx",
      fileSize: 1234,
      message: "Dateityp nicht erkannt",
    });

    const list = await admin.query(api.performance.uploadFailures.list, { companyId });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      filename: "Leads.xlsx",
      fileSize: 1234,
      message: "Dateityp nicht erkannt",
      uploadedBy: "Jörg Test",
    });
    const all = await t.run((ctx) => ctx.db.query("performanceUploadFailures").collect());
    expect(all.map((r) => r.filename)).toEqual(["Leads.xlsx"]);

    await expect(
      t.withIdentity({ subject: "anna" }).query(api.performance.uploadFailures.list, { companyId }),
    ).rejects.toThrow();
  });
});
