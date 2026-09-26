import { describe, expect, test } from "bun:test";

import { type AiTranscript, capTranscript, recordRequest, toParts } from "./ai.js";

function empty(): AiTranscript {
  return { version: 2, turns: [], truncated: false };
}

describe("AI transcripts", () => {
  test("files show up as a placeholder naming them, never their bytes", () => {
    const parts = toParts([
      { type: "text", text: "Read this CV." },
      {
        type: "document",
        title: "lebenslauf.pdf",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: "JVBERi0xLjQK",
        },
      },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "iVBORw0K" },
      },
    ]);
    expect(parts).toEqual([
      { type: "text", text: "Read this CV." },
      { type: "file", name: "lebenslauf.pdf" },
      { type: "file", name: "Bild" },
    ]);
    expect(JSON.stringify(parts)).not.toContain("JVBERi0");
  });

  test("a tool loop is recorded turn by turn, without repeating what was resent", () => {
    const transcript = empty();
    const cursor = { system: null, messages: 0 };
    const system = [{ type: "text", text: "Find the page." }];
    const question = { role: "user" as const, content: "Where do I request leave?" };
    const call = {
      role: "assistant" as const,
      content: [{ type: "tool_use", id: "t1", name: "search", input: { kind: "pages" } }],
    };
    const result = {
      role: "user" as const,
      content: [{ type: "tool_result", tool_use_id: "t1", content: "- page:/clockodo — Urlaub" }],
    };

    recordRequest(transcript, cursor, { system, messages: [question] });
    transcript.turns.push({
      at: 0,
      type: "reply",
      parts: toParts(call.content),
      stopReason: "tool_use",
      tokensIn: 1,
      tokensOut: 1,
    });
    recordRequest(transcript, cursor, { system, messages: [question, call, result] });

    expect(transcript.turns.map((turn) => turn.type)).toEqual([
      "instructions",
      "message",
      "reply",
      "message",
    ]);
    expect(transcript.turns[3]).toMatchObject({
      role: "user",
      parts: [{ type: "toolResult", toolCallId: "t1", text: "- page:/clockodo — Urlaub" }],
    });
  });

  test("a transcript over the cap is shortened and says so", () => {
    const transcript: AiTranscript = {
      version: 2,
      turns: [
        { at: 0, type: "instructions", text: "Be brief." },
        {
          at: 0,
          type: "message",
          role: "user",
          parts: [{ type: "text", text: "x".repeat(50_000) }],
        },
      ],
      truncated: false,
    };
    const capped = capTranscript(transcript, 10_000);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(10_000);
    expect(capped.truncated).toBe(true);
    expect(JSON.stringify(capped.turns[1])).toContain("gekürzt");
    expect(capped.turns[0]).toMatchObject({ text: "Be brief." });
    // The original is left alone — it's still what the run is building.
    expect(JSON.stringify(transcript.turns[1])).toContain("x".repeat(50_000));
  });

  test("one under the cap is kept as is", () => {
    const transcript = empty();
    expect(capTranscript(transcript)).toBe(transcript);
  });
});
