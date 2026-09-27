import { describe, expect, test } from "bun:test";

import { renderWeeklyDigest } from "./resend.js";

const base = {
  userId: "u1",
  email: "anna@advantisgroup.de",
  firstName: "Anna",
  announcements: [],
  updates: [],
  wiki: [],
  policies: [],
  events: [],
};

describe("weekly digest email", () => {
  test("lists only the sections that have something, with links", () => {
    const { subject, html } = renderWeeklyDigest({
      ...base,
      announcements: [{ title: "Sommerfest", path: "/announcements?id=a1" }],
      events: [{ title: "Teammeeting", path: "/calendar?event=e1", detail: "Mo., 5. Okt." }],
    });
    expect(subject).toContain("verpasst");
    expect(html).toContain("Hallo Anna,");
    expect(html).toContain("Ankündigungen");
    expect(html).toContain("/announcements?id=a1");
    expect(html).toContain("Nächste Woche");
    expect(html).not.toContain("Neu im Wiki");
    expect(html).toContain("/settings/notifications");
  });

  test("escapes titles people wrote", () => {
    const { html } = renderWeeklyDigest({
      ...base,
      firstName: "<b>Eve</b>",
      wiki: [{ title: '<img src=x onerror="alert(1)">', path: "/guidebooks/x" }],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<b>Eve</b>");
  });
});
