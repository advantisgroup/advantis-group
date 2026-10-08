import { describe, expect, test } from "bun:test";

import { attachmentsOf } from "./mail.js";

describe("attachmentsOf", () => {
  test("lists real attachments and skips the body and inline images", () => {
    expect(
      attachmentsOf({
        type: "multipart/mixed",
        childNodes: [
          {
            type: "multipart/related",
            childNodes: [
              { part: "1.1", type: "text/html", parameters: { charset: "utf-8" } },
              {
                part: "1.2",
                type: "image/png",
                id: "<logo@x>",
                disposition: "inline",
                dispositionParameters: { filename: "logo.png" },
              },
            ],
          },
          {
            part: "2",
            type: "application/pdf",
            size: 1200,
            disposition: "attachment",
            dispositionParameters: { filename: "Rechnung.pdf" },
          },
          { part: "3", type: "image/jpeg", parameters: { name: "foto.jpg" } },
        ],
      }),
    ).toEqual([
      { part: "2", filename: "Rechnung.pdf", contentType: "application/pdf", size: 1200 },
      { part: "3", filename: "foto.jpg", contentType: "image/jpeg", size: 0 },
    ]);
  });

  test("a plain text message has none", () => {
    expect(attachmentsOf({ part: "1", type: "text/plain" })).toEqual([]);
    expect(attachmentsOf(undefined)).toEqual([]);
  });
});
