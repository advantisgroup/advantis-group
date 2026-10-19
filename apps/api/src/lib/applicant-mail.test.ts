import { describe, expect, test } from "bun:test";

import { parseBody, parseSignature, renderApplicantMail } from "./applicant-mail.js";

const SIGNATURE = [
  "{Absender}",
  "Recruiting · advantis GmbH",
  "Fon: 0911 37753859",
  "Mail: bewerbung@advantisgroup.de",
  "Web: advantisgroup.de",
].join("\n");

const BODY = [
  "Guten Tag Lena Hoffmann,",
  "",
  "hiermit bestätigen wir Ihren Termin.",
  "",
  "> Ihr Termin",
  "> **23.10.2026 um 11:30 Uhr**",
  "> Erlenstraße 36, 90441 Nürnberg",
  "",
  "Freundliche Grüße",
].join("\n");

describe("parseBody", () => {
  test("splits paragraphs and groups > lines into a box", () => {
    expect(parseBody(BODY)).toEqual([
      { kind: "p", lines: ["Guten Tag Lena Hoffmann,"] },
      { kind: "p", lines: ["hiermit bestätigen wir Ihren Termin."] },
      {
        kind: "box",
        lines: ["Ihr Termin", "**23.10.2026 um 11:30 Uhr**", "Erlenstraße 36, 90441 Nürnberg"],
      },
      { kind: "p", lines: ["Freundliche Grüße"] },
    ]);
  });
});

describe("parseSignature", () => {
  test("fills the sender and splits label lines", () => {
    const sig = parseSignature(SIGNATURE, "Andrea Reichl");
    expect(sig.name).toBe("Andrea Reichl");
    expect(sig.role).toBe("Recruiting · advantis GmbH");
    expect(sig.rows[0]).toEqual({ label: "Fon", value: "0911 37753859" });
  });
});

describe("renderApplicantMail", () => {
  const mail = renderApplicantMail({
    body: BODY,
    signature: SIGNATURE,
    senderName: "Andrea Reichl",
  });

  test("html has the box, bold, signature and inline logos", () => {
    expect(mail.html).toContain("<strong>23.10.2026 um 11:30 Uhr</strong>");
    expect(mail.html).toContain(">Ihr Termin</div>");
    expect(mail.html).toContain("Andrea Reichl");
    expect(mail.html).toContain('href="mailto:bewerbung@advantisgroup.de"');
    expect(mail.html).toContain('href="https://advantisgroup.de"');
    expect(mail.html).toContain("cid:advantis-logo@advantisgroup.de");
    expect(mail.attachments.map((a) => a.cid)).toEqual([
      "advantis-logo@advantisgroup.de",
      "advantis-logo-signatur@advantisgroup.de",
    ]);
  });

  test("escapes what HR typed", () => {
    const evil = renderApplicantMail({
      body: "Hallo <script>x</script>",
      signature: "{Absender}",
      senderName: "A & B",
    });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("A &amp; B");
  });

  test("plain text keeps everything readable without markup", () => {
    expect(mail.text).toContain("23.10.2026 um 11:30 Uhr");
    expect(mail.text).not.toContain("**");
    expect(mail.text).not.toContain("> ");
    expect(mail.text).toContain(
      "--\nAndrea Reichl\nRecruiting · advantis GmbH\nFon: 0911 37753859",
    );
    expect(mail.text).toContain("HRB 46148");
  });
});
