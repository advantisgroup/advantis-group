import { expect, test } from "vitest";

import { buildPriceListHtml, formatBerlinStand, newestPriceDate } from "./priceList";

const table = {
  // 21.10.2026 05:55:15 UTC = 07:55 in Berlin (Sommerzeit)
  receivedAt: Date.UTC(2026, 9, 21, 5, 55, 15),
  columns: ["DEU Preiszone 1", "LP_AUT_1"],
  rows: [
    { date: "2026-10-20", values: ["1,888", "1,789"] },
    { date: "2026-10-21", values: ["1,908", "1,810"] },
  ],
};

test("Stand in Berliner Zeit", () => {
  expect(formatBerlinStand(table.receivedAt)).toBe("21.10.2026, 07:55");
  expect(formatBerlinStand(Date.UTC(2026, 11, 1, 6, 5))).toBe("01.12.2026, 07:05");
});

test("neuester Tag", () => {
  expect(newestPriceDate(table.rows)).toBe("2026-10-21");
  expect(newestPriceDate([])).toBeNull();
});

test("HTML wie im Migrations-Eintrag, neuester Tag oben", () => {
  const html = buildPriceListHtml(table);
  expect(
    html.startsWith("<p>Netto-Listenpreise je Preiszone (€/Liter), neuester Tag oben.</p>"),
  ).toBe(true);
  expect(html).toContain('<div data-callout="info"><p>Stand: 21.10.2026, 07:55 Uhr.');
  expect(html).toContain(
    "<thead><tr><th>Datum</th><th>DEU Preiszone 1</th><th>LP_AUT_1</th></tr></thead>",
  );
  expect(html).toContain(
    "<tbody><tr><td><strong>21.10.2026</strong></td><td>1,908</td><td>1,810</td></tr><tr><td><strong>20.10.2026</strong></td>",
  );
});
