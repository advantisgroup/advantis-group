import { describe, expect, test } from "bun:test";

import { DEFAULT_PRICE_COLUMNS, isPriceListSubject, parsePriceTable } from "./price-list.js";

// Ausschnitt aus einer echten weitergeleiteten Mail (Text-Teil, gekürzt).
const FORWARDED = [
  "",
  "________________________________",
  "Von: Datawarehouse <dwh@example.com>",
  "Gesendet: Mittwoch, 21. Oktober 2026 07:55:08 (UTC+01:00) Amsterdam, Berlin",
  "Betreff: LP Network Germany and Austria -- Prices exern callcenter",
  "",
  "Listprice net    DEU Preiszone 1         DEU Preiszone 2         DEU Preiszone 3         Listpreis_ARAL nicht Autobahn  LP_AUT_1        LP_AUT_2        LP_AUT_3        Shell-Preiszone 1       Shell-Preiszone 2       Shell-Preiszone 3       Shell-Preiszone 4",
  "2026-10-20      1,888   1,890   1,882   2,017   1,789   1,796   1,807   2,009   2,001   2,005   2,001",
  "2026-10-21      1,908   1,908   1,916   2,034   1,810   1,813   1,815   2,026   2,019   2,023   2,019",
  "2026-10-19\t1,874\t1,885\t1,877\t2,009\t1,814\t1,821\t1,832\t2,006\t1,999\t2,003\t1,999",
  "2026-08-22      1,855   1,847   1,856   2,051   1,749   1,756   1,767   2,040   2,032 ",
  "",
  "Datenschutzinformation: ...",
].join("\r\n");

describe("parsePriceTable", () => {
  test("reads header and complete rows, newest first, skipping a cut-off row", () => {
    const table = parsePriceTable(FORWARDED);
    expect(table?.columns).toEqual(DEFAULT_PRICE_COLUMNS);
    expect(table?.rows.map((r) => r.date)).toEqual(["2026-10-21", "2026-10-20", "2026-10-19"]);
    expect(table?.rows[0].values).toEqual([
      "1,908",
      "1,908",
      "1,916",
      "2,034",
      "1,810",
      "1,813",
      "1,815",
      "2,026",
      "2,019",
      "2,023",
      "2,019",
    ]);
  });

  test("a mail without a table gives null", () => {
    expect(parsePriceTable("Hallo,\nanbei nichts.\n")).toBeNull();
  });
});

test("isPriceListSubject", () => {
  expect(isPriceListSubject("WG: LP Network Germany and Austria -- Prices exern callcenter")).toBe(
    true,
  );
  expect(isPriceListSubject("lp network germany AND austria")).toBe(true);
  expect(isPriceListSubject("Neue Bewerbung")).toBe(false);
});
