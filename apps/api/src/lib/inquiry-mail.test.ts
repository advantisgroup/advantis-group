import { afterEach, describe, expect, test } from "bun:test";

import { inquiryFromReplyAddress, replyAddress, stripQuoted } from "./inquiry-mail.js";

describe("reply addresses", () => {
  afterEach(() => {
    delete process.env.INQUIRY_INBOUND_DOMAIN;
    delete process.env.INQUIRY_REPLY_SECRET;
  });

  test("a signed address leads back to its inquiry, a tampered one doesn't", () => {
    process.env.INQUIRY_INBOUND_DOMAIN = "reply.example.com";
    process.env.INQUIRY_REPLY_SECRET = "secret";
    const address = replyAddress("k57abc123")!;
    expect(address).toMatch(/^reply\+k57abc123\.[a-f0-9]{16}@reply\.example\.com$/);
    expect(inquiryFromReplyAddress(address)).toBe("k57abc123");
    expect(inquiryFromReplyAddress(address.replace("k57abc123", "k57abc999"))).toBeNull();
  });

  test("without an inbound domain nothing is accepted", () => {
    expect(inquiryFromReplyAddress("reply+k57abc123.0123456789abcdef@x.com")).toBeNull();
  });
});

describe("stripQuoted", () => {
  test("keeps the reply and drops the quoted thread", () => {
    expect(stripQuoted("Thanks, that works.\n\nOn Tue, Anna wrote:\n> earlier")).toBe(
      "Thanks, that works.",
    );
    expect(stripQuoted("Passt.\r\nAm Di., 2. Okt. schrieb Anna:\r\n> vorher")).toBe("Passt.");
  });
});
