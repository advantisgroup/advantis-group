import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { ApiError } from "./errors.js";
import {
  berlinDate,
  buildSfIssueRow,
  callSheet,
  parseSfIssueList,
  sanitizeCell,
} from "./sf-issues.js";

const realFetch = globalThis.fetch;

describe("sanitizeCell", () => {
  test("entschärft Formeln", () => {
    expect(sanitizeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(sanitizeCell(" +49 ")).toBe("'+49");
    expect(sanitizeCell("-1")).toBe("'-1");
    expect(sanitizeCell("@x")).toBe("'@x");
    expect(sanitizeCell("CAM ID 517324")).toBe("CAM ID 517324");
    expect(sanitizeCell(undefined)).toBe("");
  });
});

describe("buildSfIssueRow", () => {
  test("baut die Zeile mit Datum (Berlin) und DRINGEND", () => {
    const now = new Date("2026-10-21T23:30:00Z"); // in Berlin schon 22.10.
    const row = buildSfIssueRow(
      {
        project: "Inbound",
        camId: "CAM ID 517324",
        firma: " Muster GmbH ",
        topic: "SEPA not possible",
        beschreibung: "=geht nicht",
        dringend: true,
        sfLink: "https://uta.lightning.force.com/x",
      },
      "Max Muster",
      now,
    );
    expect(row).toEqual({
      datum: "22.10.2026",
      consultant: "Max Muster",
      project: "Inbound",
      camId: "CAM ID 517324",
      firma: "Muster GmbH",
      topic: "SEPA not possible",
      beschreibung: "'=geht nicht",
      info: "DRINGEND",
      sfLink: "https://uta.lightning.force.com/x",
    });
    expect(berlinDate(new Date("2026-01-05T10:00:00Z"))).toBe("05.01.2026");
  });
});

describe("parseSfIssueList", () => {
  test("füllt fehlende Felder und begrenzt auf 50", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ row: i + 2, firma: `F${i}` }));
    const list = parseSfIssueList({ ok: true, items });
    expect(list).toHaveLength(50);
    expect(list[0]).toMatchObject({ row: 2, firma: "F0", status: "Open", topic: "" });
    expect(parseSfIssueList({ ok: true })).toEqual([]);
  });
});

describe("callSheet", () => {
  beforeEach(() => {
    process.env.SF_SHEET_URL = "https://script.google.com/macros/s/test/exec";
    process.env.SF_SHEET_TOKEN = "geheim";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.SF_SHEET_URL;
    delete process.env.SF_SHEET_TOKEN;
  });

  test("503 ohne Konfiguration", async () => {
    delete process.env.SF_SHEET_TOKEN;
    const err = await callSheet("list", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
  });

  test("sendet Token und Aktion als POST-Body", async () => {
    const fetchMock = mock(async (_url: string, _init?: RequestInit) =>
      Response.json({ ok: true, row: 7 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const data = await callSheet("append", { row: { firma: "X" } });
    expect(data.row).toBe(7);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://script.google.com/macros/s/test/exec");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      token: "geheim",
      action: "append",
      row: { firma: "X" },
    });
  });

  test("502 bei forbidden oder Netzfehler", async () => {
    globalThis.fetch = (async () =>
      Response.json({ ok: false, error: "forbidden" })) as unknown as typeof fetch;
    const err = await callSheet("list", {}).catch((e) => e);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).message).toContain("Token");

    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const err2 = await callSheet("list", {}).catch((e) => e);
    expect((err2 as ApiError).status).toBe(502);
  });
});
