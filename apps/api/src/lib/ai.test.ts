import { describe, expect, test } from "bun:test";

import { type AiTranscript, capTranscript, contentToText } from "./ai.js";

describe("AI transcripts", () => {
  test("files show up as a placeholder naming them, never their bytes", () => {
    const text = contentToText([
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
    expect(text).toContain("Read this CV.");
    expect(text).toContain("[Dokument: lebenslauf.pdf]");
    expect(text).toContain("[Bild]");
    expect(text).not.toContain("JVBERi0");
    expect(text).not.toContain("iVBOR");
  });

  test("a transcript over the cap is shortened and says so", () => {
    const transcript: AiTranscript = {
      version: 1,
      calls: [
        {
          at: 0,
          system: "Be brief.",
          messages: [{ role: "user", text: "x".repeat(50_000) }],
          reply: "ok",
          stopReason: "end_turn",
          tokensIn: 1,
          tokensOut: 1,
        },
      ],
      lookups: [],
      truncated: false,
    };
    const capped = capTranscript(transcript, 10_000);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(10_000);
    expect(capped.truncated).toBe(true);
    expect(capped.calls[0].messages[0].text).toContain("gekürzt");
    expect(capped.calls[0].system).toBe("Be brief.");
    // The original is left alone — it's still what the run is building.
    expect(transcript.calls[0].messages[0].text).toHaveLength(50_000);
  });

  test("one under the cap is kept as is", () => {
    const transcript: AiTranscript = {
      version: 1,
      calls: [],
      lookups: [],
      truncated: false,
    };
    expect(capTranscript(transcript)).toBe(transcript);
  });
});
