import { describe, expect, test } from "bun:test";

process.env.CLERK_SECRET_KEY ??= "sk_test_placeholder";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= `pk_test_${btoa("clerk.example.com$")}`;

const { readsApplicantData } = await import("./ai-runs.js");

describe("reading a run back", () => {
  test("anything that read applicant data needs applicant access", () => {
    expect(readsApplicantData({ kind: "cvExtract", subjectKey: "cvExtract:x" })).toBe(true);
    expect(readsApplicantData({ kind: "cvRescan", subjectKey: "cvRescan:a1" })).toBe(true);
    // A question asked about an applicant holds their data just as much.
    expect(readsApplicantData({ kind: "ask", subjectKey: "ask:applicant:a1" })).toBe(true);
  });

  test("everything else doesn't", () => {
    expect(readsApplicantData({ kind: "ask", subjectKey: "ask:itTicket:t1" })).toBe(false);
    expect(readsApplicantData({ kind: "navigate", subjectKey: "navigate" })).toBe(false);
    expect(readsApplicantData({ kind: "wikiChat", subjectKey: "wikiChat:c1" })).toBe(false);
  });
});
