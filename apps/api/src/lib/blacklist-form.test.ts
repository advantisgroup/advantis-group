import { describe, expect, test } from "bun:test";

import { BLACKLIST_CHOICES, buildBlacklistPayload, looksLikeUrl } from "./blacklist-form.js";

describe("buildBlacklistPayload", () => {
  test("füllt alle Felder und hängt den Mitarbeiter an", () => {
    const p = buildBlacklistPayload(
      {
        salesforceUrl: " https://uta.lightning.force.com/lightning/r/Account/001/view ",
        accountId: "CAM 12345",
        contactName: "Max Muster",
        choice: "keep_name",
        note: "Bitte nie wieder anrufen",
      },
      "Vahan Hovhannisyan",
    );
    expect(p.get("entry.439701450")).toBe(
      "https://uta.lightning.force.com/lightning/r/Account/001/view",
    );
    expect(p.get("entry.313468504")).toBe("CAM 12345");
    expect(p.get("entry.912366685")).toBe("Max Muster");
    expect(p.get("entry.174213086")).toBe(BLACKLIST_CHOICES.keep_name);
    expect(p.get("entry.1679614355")).toBe(
      "Bitte nie wieder anrufen\n\nEingetragen über das Intranet von Vahan Hovhannisyan",
    );
  });

  test("ohne optionale Felder", () => {
    const p = buildBlacklistPayload(
      { salesforceUrl: "https://x.my.salesforce.com/1", contactName: "A", choice: "delete_all" },
      "a@b.de",
    );
    expect(p.get("entry.313468504")).toBe("");
    expect(p.get("entry.174213086")).toBe(BLACKLIST_CHOICES.delete_all);
    expect(p.get("entry.1679614355")).toBe("Eingetragen über das Intranet von a@b.de");
  });
});

test("looksLikeUrl", () => {
  expect(looksLikeUrl("https://x.lightning.force.com/a")).toBe(true);
  expect(looksLikeUrl("kein link")).toBe(false);
  expect(looksLikeUrl("javascript:alert(1)")).toBe(false);
});
