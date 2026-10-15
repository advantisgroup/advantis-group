import { describe, expect, test } from "bun:test";

import { positionFor } from "./applicants";

describe("positionFor", () => {
  test("files the applicant under the advertised job and keeps the CV's", () => {
    expect(positionFor("Callcenter-Mitarbeiter (m/w/d)", "Pflegefachkraft")).toEqual({
      position: "Callcenter-Mitarbeiter (m/w/d)",
      notizen: "Laut Lebenslauf: Pflegefachkraft",
    });
  });

  test("no note when the CV names nothing or the same job", () => {
    expect(positionFor("Callcenter", "")).toEqual({ position: "Callcenter", notizen: undefined });
    expect(positionFor("Callcenter", "Callcenter")).toEqual({
      position: "Callcenter",
      notizen: undefined,
    });
  });

  test("without an advertised job the CV's position stays", () => {
    expect(positionFor(null, "Bankkaufmann")).toEqual({
      position: "Bankkaufmann",
      notizen: undefined,
    });
  });
});
