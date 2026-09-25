import { describe, expect, test } from "vitest";

import {
  buildIcs,
  classifyBounce,
  classifyResendError,
  formatReference,
  inquiryTitleParts,
  isWithinCallbackHours,
  legacyDesiredAt,
  replyDueAt,
  zonedLocalToInstant,
} from "./inquiry";

describe("formatReference", () => {
  test("pads to four digits and keeps growing past them", () => {
    expect(formatReference(42)).toBe("AG-0042");
    expect(formatReference(12345)).toBe("AG-12345");
  });
});

describe("replyDueAt", () => {
  test("is the next day on a weekday", () => {
    const tuesday = Date.UTC(2026, 8, 22, 10); // Tue 22 Sep 2026, 12:00 Berlin
    expect(replyDueAt(tuesday)).toBe(Date.UTC(2026, 8, 23, 10));
  });

  test("skips the weekend on a Friday", () => {
    const friday = Date.UTC(2026, 8, 25, 14);
    expect(replyDueAt(friday)).toBe(Date.UTC(2026, 8, 28, 14));
  });

  test("lands on Monday when sent on a Saturday", () => {
    const saturday = Date.UTC(2026, 8, 26, 9);
    expect(new Date(replyDueAt(saturday)).getUTCDay()).toBe(1);
  });
});

describe("callback hours", () => {
  test("accepts a weekday afternoon in Berlin and refuses nights and weekends", () => {
    expect(isWithinCallbackHours(Date.UTC(2026, 8, 24, 12))).toBe(true); // Thu 14:00
    expect(isWithinCallbackHours(Date.UTC(2026, 8, 24, 17))).toBe(false); // Thu 19:00
    expect(isWithinCallbackHours(Date.UTC(2026, 8, 26, 10))).toBe(false); // Sat
  });
});

describe("zoned times", () => {
  test("reads a zone-less datetime as that zone's wall clock, across DST", () => {
    expect(zonedLocalToInstant("2026-07-01T14:30", "Europe/Berlin")).toBe(
      Date.UTC(2026, 6, 1, 12, 30),
    );
    expect(zonedLocalToInstant("2026-12-01T14:30", "Europe/Berlin")).toBe(
      Date.UTC(2026, 11, 1, 13, 30),
    );
    expect(zonedLocalToInstant("2026-12-01T14:30", "Asia/Shanghai")).toBe(
      Date.UTC(2026, 11, 1, 6, 30),
    );
  });

  test("understands the old epoch values too", () => {
    expect(legacyDesiredAt("1790000000")).toBe(1790000000 * 1000);
    expect(legacyDesiredAt("1790000000000")).toBe(1790000000000);
    expect(legacyDesiredAt("not a date")).toBeNull();
  });
});

describe("failure categories", () => {
  test("maps Resend errors to something a customer can act on", () => {
    expect(classifyResendError({ name: "rate_limit_exceeded", statusCode: 429 })).toBe(
      "rate_limited",
    );
    expect(classifyResendError({ name: "validation_error", message: "Invalid `to` field" })).toBe(
      "invalid_address",
    );
    expect(classifyResendError({ name: "internal_server_error", statusCode: 500 })).toBe(
      "provider_error",
    );
    expect(classifyResendError(new TypeError("fetch failed"))).toBe("provider_error");
    expect(classifyResendError("weird")).toBe("unknown");
  });

  test("tells a permanent bounce from a transient one", () => {
    expect(classifyBounce({ type: "Permanent" })).toBe("mailbox_unavailable");
    expect(classifyBounce({ type: "Transient" })).toBe("temporary");
    expect(classifyBounce(undefined)).toBe("unknown");
  });
});

describe("inquiryTitleParts", () => {
  const base = { subject: "User Request - Message", message: "" };

  test("names a message by its first line and keeps the rest for a preview", () => {
    expect(
      inquiryTitleParts({ ...base, submissionType: "message", message: "\n  Hello there\nMore" }),
    ).toEqual({ kind: "text", text: "Hello there", rest: "More" });
  });

  test("names a callback by its time, including old string rows", () => {
    expect(
      inquiryTitleParts({
        ...base,
        submissionType: "callback",
        desiredDateTime: "2026-10-02T14:30",
      }),
    ).toEqual({ kind: "callback", at: Date.UTC(2026, 9, 2, 12, 30), timeZone: undefined });
  });

  test("keeps the subject the person typed for other inquiries", () => {
    expect(
      inquiryTitleParts({ submissionType: "other", subject: "Contract", message: "x" }),
    ).toEqual({ kind: "subject", text: "Contract" });
  });
});

describe("buildIcs", () => {
  test("writes a UTC event with escaped text and CRLF lines", () => {
    const ics = buildIcs({
      uid: "abc",
      start: Date.UTC(2026, 9, 2, 12, 30),
      title: "Callback, ADVANTIS",
      method: "REQUEST",
      now: Date.UTC(2026, 8, 25),
    });
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20261002T123000Z\r\n");
    expect(ics).toContain("DTEND:20261002T130000Z\r\n");
    expect(ics).toContain("SUMMARY:Callback\\, ADVANTIS\r\n");
  });
});
