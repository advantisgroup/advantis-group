import { describe, expect, test } from "bun:test";

import { FULL_WIKI_CHARS, type Knowledge, knowledgePrompt } from "./knowledge.js";

const entry = (id: string, title: string, text: string) => ({
  id: id as Knowledge["entries"][number]["id"],
  slug: title.toLowerCase(),
  title,
  category: null,
  tags: [],
  updatedAt: Date.UTC(2026, 10, 1),
  validUntil: Date.UTC(2027, 10, 1),
  version: 1,
  text,
});

describe("knowledge prompt", () => {
  test("a wiki that fits goes whole into the cached part", () => {
    const knowledge: Knowledge = {
      entries: [
        entry("a", "Tankkarte", "Basic kostet 0,95 €."),
        entry("b", "Maut", "OBU über myUTA."),
      ],
      rules: [{ id: null, title: "Grundwissen", text: "Cards: -660" }],
    };
    const prompt = knowledgePrompt(knowledge, "Was kostet die Tankkarte?");
    expect(prompt.whole).toBe(true);
    expect(prompt.matches).toBe("");
    expect(prompt.stable).toContain("Basic kostet 0,95 €.");
    expect(prompt.stable).toContain("OBU über myUTA.");
    expect(prompt.stable).toContain("Cards: -660");
    expect(prompt.top.map((e) => e.title)).toEqual(["Tankkarte"]);
  });

  test("a bigger one sends a table of contents and the best matches", () => {
    const filler = "x ".repeat(FULL_WIKI_CHARS / 2);
    const knowledge: Knowledge = {
      entries: [entry("a", "Tankkarte", "Basic kostet 0,95 €."), entry("b", "Archiv", filler)],
      rules: [],
    };
    const prompt = knowledgePrompt(knowledge, "Tankkarte Preis");
    expect(prompt.whole).toBe(false);
    expect(prompt.stable).toContain("wiki:b | Archiv");
    expect(prompt.stable).not.toContain(filler);
    expect(prompt.matches).toContain("Basic kostet 0,95 €.");
  });
});
