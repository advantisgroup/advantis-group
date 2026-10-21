/** Wettbewerbs-Übersicht: ein Wiki-Eintrag, Ankündigung nur bei Neuigkeiten. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { type Changes, WIKI_SLUG } from "./watch";

const empty: Changes = { neueProdukte: [], entfalleneProdukte: [], neu: [], entfallen: [] };

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "u1",
      email: "kollege@advantisgroup.de",
      firstName: "Kollege",
      role: "employee",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  return t;
}

const announcements = (t: Awaited<ReturnType<typeof setup>>) =>
  t.run((ctx) => ctx.db.query("announcements").collect());

describe("competitors watch", () => {
  test("erster Lauf legt den Wiki-Eintrag an und kündigt ihn an", async () => {
    const t = await setup();
    await t.mutation(internal.competitors.watch.recordSource, {
      key: "aral-fuel-charge",
      result: {
        ok: true,
        unchanged: false,
        hash: "h1",
        text: "Aral Fuel & Charge …",
        offers: [
          {
            anbieter: "Aral",
            produkt: "Aral Fuel & Charge",
            art: "Tank- und Ladekarte",
            merkmale: [
              {
                label: "Ladepunkte Deutschland",
                wert: "93 % aller öffentlichen Ladepunkte",
                beleg: "Zugriff auf 93 Prozent aller öffentlich zugänglichen Ladepunkte",
              },
            ],
          },
        ],
        changes: empty,
      },
    });
    await t.mutation(internal.competitors.watch.publish, { changes: [] });

    const entries = await t.run((ctx) => ctx.db.query("wikiEntries").collect());
    const entry = entries.find((e) => e.slug === WIKI_SLUG)!;
    expect(entry.erklaerung).toContain("Aral Fuel &amp; Charge");
    expect(entry.erklaerung).toContain("93 % aller öffentlichen Ladepunkte");
    expect(entry.erklaerung).toContain("aral.de");
    const posted = await announcements(t);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.title).toContain("Neu im Wiki");
    const notified = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notified).toHaveLength(1);
  });

  test("ohne Änderungen keine Ankündigung, mit Änderungen eine", async () => {
    const t = await setup();
    await t.mutation(internal.competitors.watch.publish, { changes: [] });
    await t.mutation(internal.competitors.watch.publish, { changes: [] });
    expect(await announcements(t)).toHaveLength(1);

    await t.mutation(internal.competitors.watch.publish, {
      changes: [
        {
          source: "dkv-card-charge",
          changes: {
            ...empty,
            neu: [
              {
                anbieter: "DKV",
                produkt: "DKV Card +Charge",
                label: "Ladepunkte Europa",
                wert: "1,2 Mio.",
              },
            ],
            entfallen: [
              {
                anbieter: "DKV",
                produkt: "DKV Card +Charge",
                label: "Ladepunkte Europa",
                wert: "1 Mio.",
              },
            ],
          },
        },
      ],
    });
    const posted = await announcements(t);
    expect(posted).toHaveLength(2);
    const latest = posted.find((a) => a.title.includes("Neuigkeiten"))!;
    expect(latest.body).toContain("jetzt <strong>1,2 Mio.</strong> (vorher 1 Mio.)");
    expect(latest.category).toBe("Wettbewerb");
  });

  test("ein gelöschter Eintrag wird nicht wiederbelebt", async () => {
    const t = await setup();
    await t.mutation(internal.competitors.watch.publish, { changes: [] });
    await t.run(async (ctx) => {
      const entry = (await ctx.db.query("wikiEntries").collect())[0]!;
      await ctx.db.patch(entry._id, { deletedAt: Date.now() });
    });
    await t.mutation(internal.competitors.watch.publish, { changes: [] });
    const entries = await t.run((ctx) => ctx.db.query("wikiEntries").collect());
    expect(entries).toHaveLength(1);
  });

  test("eine nicht lesbare Seite behält ihren Stand", async () => {
    const t = await setup();
    const offers = [
      {
        anbieter: "Shell",
        produkt: "Shell Card",
        art: "Tank- und Ladekarte",
        merkmale: [
          {
            label: "Tankstellen Deutschland",
            wert: "rund 5.300",
            beleg: "Insgesamt gibt es rund 5.300 Akzeptanzstellen",
          },
        ],
      },
    ];
    await t.mutation(internal.competitors.watch.recordSource, {
      key: "shell-card",
      result: { ok: true, unchanged: false, hash: "h", text: "t", offers, changes: empty },
    });
    await t.mutation(internal.competitors.watch.recordSource, {
      key: "shell-card",
      result: { ok: false, error: "fetch" },
    });
    const state = await t.query(internal.competitors.watch.sourceState, { key: "shell-card" });
    expect(state.prevOffers).toEqual(offers);
    expect(state.prevHash).toBe("h");
  });
});

describe("Testbetrieb", () => {
  test("test: nur für Admins, keine Ankündigung, bis release", async () => {
    const t = await setup();
    await t.mutation(internal.competitors.watch.publish, { changes: [], test: true });
    await t.mutation(internal.competitors.watch.publish, {
      changes: [
        {
          source: "dkv-card-charge",
          changes: {
            ...empty,
            neueProdukte: [
              { anbieter: "DKV", produkt: "DKV Card +Charge Truck", art: "Ladekarte" },
            ],
          },
        },
      ],
    });
    let entry = (await t.run((ctx) => ctx.db.query("wikiEntries").collect()))[0]!;
    expect(entry.minRole).toBe("admin");
    expect(await announcements(t)).toHaveLength(0);

    const res = await t.mutation(internal.competitors.watch.release, {});
    expect(res.result).toBe("released");
    entry = (await t.run((ctx) => ctx.db.query("wikiEntries").collect()))[0]!;
    expect(entry.minRole).toBeUndefined();
    const posted = await announcements(t);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.title).toContain("Neu im Wiki");
  });
});
