/**
 * "Interne Notizen": admins write and read notes about an employee; the
 * employee and a non-admin team lead get nothing, and an admin's
 * "Ansicht als" preview hides them too.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (clerkUserId: string, role: "admin" | "employee", firstName: string) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName,
        lastName: "Test",
        role,
        status: "active",
        external: false,
        createdAt: now,
      });
    const admin = await user("admin", "admin", "Ada");
    const admin2 = await user("admin2", "admin", "Andrea");
    const lead = await user("lead", "employee", "Lea");
    const anna = await user("anna", "employee", "Anna");
    const sales = await ctx.db.insert("departments", {
      name: "Sales",
      reportsToUserId: lead,
      createdAt: now,
      createdBy: admin,
    });
    for (const userId of [lead, anna]) await ctx.db.patch(userId, { departmentId: sales });
    const salesDash = await ctx.db.insert("companies", {
      name: "Sales",
      slug: "sales",
      departmentIds: [sales],
      createdAt: now,
      updatedAt: now,
    });
    const annaEmp = await ctx.db.insert("performanceEmployees", {
      name: "Anna Test",
      active: true,
      companyId: salesDash,
      userId: anna,
    });
    return { anna, annaEmp };
  });
  return { t, ids, as: (subject: string) => t.withIdentity({ subject }) };
}

describe("performance notes", () => {
  test("admins add, see, edit and delete notes", async () => {
    const { as, ids } = await setup();
    const { id } = await as("admin").mutation(api.performance.notes.add, {
      employeeId: ids.annaEmp,
      text: "  Gespräch am Montag  ",
    });
    const notes = await as("admin2").query(api.performance.notes.list, {
      employeeId: ids.annaEmp,
    });
    expect(notes).toEqual([
      expect.objectContaining({ text: "Gespräch am Montag", authorName: "Ada Test", mine: false }),
    ]);
    await as("admin2").mutation(api.performance.notes.update, { id, text: "Neu" });
    expect(
      (await as("admin").query(api.performance.notes.list, { employeeId: ids.annaEmp }))[0],
    ).toEqual(expect.objectContaining({ text: "Neu", mine: true }));
    await as("admin").mutation(api.performance.notes.remove, { id });
    expect(
      await as("admin").query(api.performance.notes.list, { employeeId: ids.annaEmp }),
    ).toEqual([]);
  });

  test("the employee and a non-admin team lead can't read or write", async () => {
    const { as, ids } = await setup();
    await as("admin").mutation(api.performance.notes.add, { employeeId: ids.annaEmp, text: "x" });
    for (const who of ["anna", "lead"]) {
      await expect(
        as(who).query(api.performance.notes.list, { employeeId: ids.annaEmp }),
      ).rejects.toThrow("Nur Admins");
      await expect(
        as(who).mutation(api.performance.notes.add, { employeeId: ids.annaEmp, text: "y" }),
      ).rejects.toThrow("Nur Admins");
    }
  });

  test("hidden during an admin's Ansicht als preview", async () => {
    const { as, ids } = await setup();
    await as("admin").mutation(api.performance.access.setViewAs, { userId: ids.anna });
    await expect(
      as("admin").query(api.performance.notes.list, { employeeId: ids.annaEmp }),
    ).rejects.toThrow("Nur Admins");
  });

  test("empty notes are refused", async () => {
    const { as, ids } = await setup();
    await expect(
      as("admin").mutation(api.performance.notes.add, { employeeId: ids.annaEmp, text: "   " }),
    ).rejects.toThrow("leer");
  });
});
