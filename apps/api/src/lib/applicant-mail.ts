import { MAIL_HEADER_LOGO_PNG_BASE64, MAIL_SIGNATURE_LOGO_PNG_BASE64 } from "./mail-logos.js";

/**
 * Lays out a mail to an applicant: the text from the send dialog (a filled-in
 * HR template) becomes branded HTML with logo, highlight boxes and the HR
 * signature, plus the same content as plain text for simple mail programs.
 *
 * The template text stays plain text with two small rules:
 *   - lines starting with "> " form a highlight box; with two or more lines
 *     the first one is the box's small heading
 *   - **text** is bold
 * The signature (HR → Vorlagen) is line 1 = name, line 2 = role, then
 * "Label: Wert" lines; `{Absender}` becomes the sender's name.
 */

const BRAND = "#EE4767";
const BOX_BG = "#FDF1F3";
const BOX_TITLE = "#A82640";
const TEXT = "#2B231D";
const SIG_BG = "#47141E";
const SIG_TEXT = "#F3E6E1";
const SIG_SUB = "#D9B9B4";
const SIG_LABEL = "#C08A8F";
const SIG_LINE = "#6B2F3A";
const SIG_FOOT = "#B48A8F";
const FONT = "Arial,Helvetica,sans-serif";

export const COMPANY_FOOTER =
  "advantis GmbH · Amtsgericht Nürnberg HRB 46148 · USt-IdNr. DE463759734";

const HEADER_CID = "advantis-logo@advantisgroup.de";
const SIGNATURE_CID = "advantis-logo-signatur@advantisgroup.de";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes, then turns **x** into bold. */
function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function stripMarks(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

type Block = { kind: "p"; lines: string[] } | { kind: "box"; lines: string[] };

/** Paragraphs split on blank lines; consecutive "> " lines form a box. */
export function parseBody(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const quoted = /^>\s?/.test(line);
    if (!line.trim()) {
      current = null;
      continue;
    }
    const kind = quoted ? "box" : "p";
    const content = quoted ? line.replace(/^>\s?/, "") : line;
    if (!current || current.kind !== kind) {
      const next: Block = { kind, lines: [] };
      blocks.push(next);
      current = next;
    }
    current.lines.push(content);
  }
  return blocks;
}

function renderBlock(block: Block): string {
  if (block.kind === "p") {
    return `<p style="margin:0 0 12px 0;">${block.lines.map(inline).join("<br>")}</p>`;
  }
  const [first, ...rest] = block.lines;
  const title =
    rest.length > 0
      ? `<div style="font-size:11px;color:${BOX_TITLE};font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 2px 0;">${inline(first)}</div>`
      : "";
  const lines = (rest.length > 0 ? rest : [first]).map((l) => `<div>${inline(l)}</div>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 14px 0;"><tr><td style="border-left:4px solid ${BRAND};background-color:${BOX_BG};padding:11px 15px;font-family:${FONT};font-size:14px;line-height:1.6;color:${TEXT};">${title}${lines}</td></tr></table>`;
}

interface Signature {
  name: string;
  role: string | null;
  rows: { label: string | null; value: string }[];
}

export function parseSignature(signature: string, senderName: string): Signature {
  const lines = signature
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\{Absender\}/g, senderName).trim())
    .filter(Boolean);
  const [name = senderName, role = null, ...rest] = lines;
  return {
    name,
    role,
    rows: rest.map((line) => {
      const match = /^([^:]{1,20}):\s*(.+)$/.exec(line);
      return match
        ? { label: match[1].trim(), value: match[2].trim() }
        : { label: null, value: line };
    }),
  };
}

function linkFor(value: string): string | null {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value) && !value.includes("@")) {
    return value.startsWith("http") ? value : `https://${value}`;
  }
  return null;
}

function renderSignature(sig: Signature): string {
  const rows = sig.rows
    .map(({ label, value }) => {
      const href = linkFor(value);
      const shown = href
        ? `<a href="${escapeHtml(href)}" style="color:${SIG_TEXT};text-decoration:none;">${escapeHtml(value)}</a>`
        : escapeHtml(value);
      return `<tr><td valign="top" style="font-family:${FONT};font-size:12px;line-height:1.6;color:${SIG_LABEL};padding:0 8px 0 0;white-space:nowrap;">${label ? escapeHtml(label) : ""}</td><td style="font-family:${FONT};font-size:12px;line-height:1.6;color:${SIG_TEXT};">${shown}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${SIG_BG}" style="border-collapse:collapse;background-color:${SIG_BG};margin:18px 0 0 0;">
<tr><td style="padding:16px 18px 12px 18px;background-color:${SIG_BG};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td valign="top" style="padding:0 16px 0 0;width:200px;">
<div style="font-family:${FONT};font-size:14px;font-weight:bold;color:#FFFFFF;">${escapeHtml(sig.name)}</div>
${sig.role ? `<div style="font-family:${FONT};font-size:12.5px;color:${SIG_SUB};">${escapeHtml(sig.role)}</div>` : ""}
<img src="cid:${SIGNATURE_CID}" alt="ADVANTIS-GROUP · ALL ABOUT SALES" width="180" height="22" style="display:block;margin-top:10px;width:180px;height:22px;border:0;">
</td>
<td valign="top" style="padding:0 0 0 16px;border-left:1px solid ${SIG_LINE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>
</td></tr></table>
<div style="font-family:${FONT};font-size:10px;line-height:1.5;color:${SIG_FOOT};margin-top:10px;">${escapeHtml(COMPANY_FOOTER)}</div>
</td></tr></table>`;
}

export interface RenderedApplicantMail {
  html: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string; cid: string }[];
}

export function renderApplicantMail({
  body,
  signature,
  senderName,
}: {
  body: string;
  signature: string;
  senderName: string;
}): RenderedApplicantMail {
  const sig = parseSignature(signature, senderName);
  const content = parseBody(body).map(renderBlock).join("\n");

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F4F1EC;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F4F1EC" style="background-color:#F4F1EC;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background-color:#FFFFFF;border-collapse:collapse;">
<tr><td style="padding:22px 30px 12px 30px;"><img src="cid:${HEADER_CID}" alt="ADVANTIS-GROUP · ALL ABOUT SALES" width="230" height="28" style="display:block;width:230px;height:28px;border:0;"></td></tr>
<tr><td height="3" bgcolor="${BRAND}" style="height:3px;line-height:3px;font-size:0;background-color:${BRAND};background-image:linear-gradient(90deg,#EE4767,#F4806D 55%,#F2A65A);">&nbsp;</td></tr>
<tr><td style="padding:22px 30px 26px 30px;font-family:${FONT};font-size:14px;line-height:1.6;color:${TEXT};">
${content}
${renderSignature(sig)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const plainBody = parseBody(body)
    .map((b) => b.lines.map(stripMarks).join("\n"))
    .join("\n\n");
  const plainSig = [
    "--",
    sig.name,
    ...(sig.role ? [sig.role] : []),
    ...sig.rows.map((r) => (r.label ? `${r.label}: ${r.value}` : r.value)),
    "",
    COMPANY_FOOTER,
  ].join("\n");

  return {
    html,
    text: `${plainBody}\n\n${plainSig}\n`,
    attachments: [
      {
        filename: "advantis-logo.png",
        content: Buffer.from(MAIL_HEADER_LOGO_PNG_BASE64, "base64"),
        contentType: "image/png",
        cid: HEADER_CID,
      },
      {
        filename: "advantis-logo-signatur.png",
        content: Buffer.from(MAIL_SIGNATURE_LOGO_PNG_BASE64, "base64"),
        contentType: "image/png",
        cid: SIGNATURE_CID,
      },
    ],
  };
}
