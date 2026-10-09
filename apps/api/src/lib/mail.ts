import { ImapFlow, type MessageAddressObject, type MessageStructureObject } from "imapflow";
import { simpleParser } from "mailparser";

import { decrypt, encrypt } from "./crypto.js";
import { Errors } from "./errors.js";
import { optionalEnv } from "./env.js";

/**
 * A person's IONOS inbox over IMAP. Every call opens a fresh connection and
 * selects INBOX with EXAMINE (`readOnly`), fetching with BODY.PEEK — except
 * `markSeen`, the one write: it sets the read flag, as opening a mail in any
 * other client would. Nothing is sent, moved or deleted, and nothing is
 * cached or stored: messages are read live on each request.
 */

const ENC_KEY = "MAIL_ENC_KEY";
/** Above this a message isn't parsed for display; webmail handles it. */
const MAX_PARSE_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface MailCredentials {
  email: string;
  password: string;
}

export class MailAuthError extends Error {
  constructor() {
    super("IONOS rejected the mailbox login");
    this.name = "MailAuthError";
  }
}

export const encryptMailPassword = (password: string) => encrypt(password, ENC_KEY);
export const decryptMailPassword = (passwordEnc: string) => decrypt(passwordEnc, ENC_KEY);

/** The stored password of a preview build must never be usable: preview URLs
 *  are public and run unreviewed branches. */
export function assertMailAvailable(): void {
  if (process.env.VERCEL_ENV === "preview") {
    throw Errors.forbidden("Das Postfach ist in Vorschau-Umgebungen gesperrt.");
  }
}

async function withInbox<T>(
  creds: MailCredentials,
  fn: (client: ImapFlow) => Promise<T>,
  { write = false }: { write?: boolean } = {},
) {
  const client = new ImapFlow({
    host: optionalEnv("MAIL_IMAP_HOST") ?? "imap.ionos.de",
    port: Number(optionalEnv("MAIL_IMAP_PORT") ?? 993),
    secure: true,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 30_000,
  });
  // An unhandled 'error' event would crash the function instead of failing this call.
  client.on("error", () => {});
  try {
    await client.connect();
  } catch (error) {
    if ((error as { authenticationFailed?: boolean }).authenticationFailed) {
      throw new MailAuthError();
    }
    throw error;
  }
  try {
    await client.mailboxOpen("INBOX", { readOnly: !write });
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export interface MailAddress {
  name: string;
  address: string;
}

function toAddress(a: MessageAddressObject): MailAddress {
  return { name: a.name ?? "", address: a.address ?? "" };
}

function senderLabel(from: MessageAddressObject[] | undefined): string {
  const first = from?.[0];
  return first?.name || first?.address || "Unbekannt";
}

export interface MailAttachment {
  part: string;
  filename: string;
  contentType: string;
  size: number;
}

/** Downloadable parts of a message. Inline images referenced from the HTML
 *  body are left out — they're already embedded in what the panel shows. */
export function attachmentsOf(node: MessageStructureObject | undefined): MailAttachment[] {
  if (!node) return [];
  if (node.childNodes?.length) return node.childNodes.flatMap(attachmentsOf);
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
  const isAttachment =
    node.disposition === "attachment" ||
    (Boolean(filename) && !(node.disposition === "inline" && node.id));
  if (!isAttachment || !node.part) return [];
  return [
    {
      part: node.part,
      filename: filename || "Anhang",
      contentType: node.type,
      size: node.size ?? 0,
    },
  ];
}

/** Marks one message (or every unread one) as read; returns the unread count after. */
export async function markSeen(creds: MailCredentials, uid: number | "all"): Promise<number> {
  return withInbox(
    creds,
    async (client) => {
      if (uid === "all") {
        const unread = await client.search({ seen: false }, { uid: true });
        if (unread && unread.length > 0) {
          await client.messageFlagsAdd(unread, ["\\Seen"], { uid: true });
        }
      } else {
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
      const left = await client.search({ seen: false });
      return left ? left.length : 0;
    },
    { write: true },
  );
}

export async function checkLogin(creds: MailCredentials): Promise<void> {
  await withInbox(creds, async () => undefined);
}

export interface InboxItem {
  uid: number;
  date: string | null;
  from: MailAddress | null;
  subject: string;
  seen: boolean;
  hasAttachments: boolean;
  size: number;
}

/** Newest first. `before` is a sequence number from the previous page. */
export async function listInbox(
  creds: MailCredentials,
  { limit, before }: { limit: number; before?: number },
): Promise<{ items: InboxItem[]; total: number; nextBefore: number | null }> {
  return withInbox(creds, async (client) => {
    const total = client.mailbox ? client.mailbox.exists : 0;
    const top = Math.min(before ? before - 1 : total, total);
    if (top < 1) return { items: [], total, nextBefore: null };
    const bottom = Math.max(1, top - limit + 1);
    const items: (InboxItem & { seq: number })[] = [];
    for await (const msg of client.fetch(`${bottom}:${top}`, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
      internalDate: true,
      size: true,
    })) {
      const date = msg.envelope?.date ?? msg.internalDate;
      items.push({
        seq: msg.seq,
        uid: msg.uid,
        date: date ? new Date(date).toISOString() : null,
        from: msg.envelope?.from?.[0] ? toAddress(msg.envelope.from[0]) : null,
        subject: msg.envelope?.subject ?? "",
        seen: msg.flags?.has("\\Seen") ?? false,
        hasAttachments: attachmentsOf(msg.bodyStructure).length > 0,
        size: msg.size ?? 0,
      });
    }
    items.sort((a, b) => b.seq - a.seq);
    return {
      items: items.map(({ seq: _seq, ...item }) => item),
      total,
      nextBefore: bottom > 1 ? bottom : null,
    };
  });
}

export interface MailMessage {
  uid: number;
  subject: string;
  date: string | null;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  seen: boolean;
  html: string | null;
  text: string | null;
  tooLarge: boolean;
  attachments: MailAttachment[];
}

export async function readMessage(creds: MailCredentials, uid: number): Promise<MailMessage> {
  return withInbox(creds, async (client) => {
    const meta = await client.fetchOne(
      String(uid),
      {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        size: true,
        internalDate: true,
      },
      { uid: true },
    );
    if (!meta) throw Errors.notFound("Diese E-Mail gibt es nicht mehr.");
    const envelope = meta.envelope;
    const date = envelope?.date ?? meta.internalDate;
    const base = {
      uid,
      subject: envelope?.subject ?? "",
      date: date ? new Date(date).toISOString() : null,
      from: (envelope?.from ?? []).map(toAddress),
      to: (envelope?.to ?? []).map(toAddress),
      cc: (envelope?.cc ?? []).map(toAddress),
      seen: meta.flags?.has("\\Seen") ?? false,
      attachments: attachmentsOf(meta.bodyStructure),
    };
    if ((meta.size ?? 0) > MAX_PARSE_BYTES) {
      return { ...base, html: null, text: null, tooLarge: true };
    }
    const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!full || !full.source) throw Errors.notFound("Diese E-Mail gibt es nicht mehr.");
    // simpleParser turns cid: references into data: URLs, so inline images
    // show without a second round trip.
    const parsed = await simpleParser(full.source);
    return {
      ...base,
      html: typeof parsed.html === "string" ? parsed.html : null,
      text: parsed.text ?? null,
      tooLarge: false,
    };
  });
}

export async function downloadAttachment(
  creds: MailCredentials,
  uid: number,
  part: string,
): Promise<{ filename: string; contentType: string; content: Buffer }> {
  return withInbox(creds, async (client) => {
    const meta = await client.fetchOne(String(uid), { bodyStructure: true }, { uid: true });
    const attachment = attachmentsOf(meta ? meta.bodyStructure : undefined).find(
      (a) => a.part === part,
    );
    if (!attachment) throw Errors.notFound("Anhang nicht gefunden.");
    if (attachment.size > MAX_ATTACHMENT_BYTES * 1.4) {
      throw Errors.badRequest("Anhang zu groß – bitte im IONOS-Webmail öffnen.");
    }
    const download = await client.download(String(uid), part, {
      uid: true,
      maxBytes: MAX_ATTACHMENT_BYTES,
    });
    if (!download.content) throw Errors.notFound("Anhang nicht gefunden.");
    const chunks: Buffer[] = [];
    for await (const chunk of download.content) chunks.push(chunk as Buffer);
    return {
      filename: attachment.filename,
      contentType: attachment.contentType || "application/octet-stream",
      content: Buffer.concat(chunks),
    };
  });
}

export interface PollTarget {
  id: string;
  email: string;
  passwordEnc: string;
  updatedAt: number;
  uidValidity: string | null;
  uidNext: number | null;
}

export type PollResult =
  | {
      id: string;
      updatedAt: number;
      ok: true;
      uidValidity: string;
      uidNext: number;
      unseen: number;
      newCount: number;
      newMessages: { uid: number; from: string; subject: string }[];
    }
  | { id: string; updatedAt: number; ok: false; error: "auth" | "connect" };

/** Shown individually; Convex summarises anything beyond this. */
const NOTIFY_NEWEST = 3;

export async function pollAccount(target: PollTarget): Promise<PollResult> {
  const head = { id: target.id, updatedAt: target.updatedAt };
  try {
    const creds = { email: target.email, password: decryptMailPassword(target.passwordEnc) };
    return await withInbox(creds, async (client) => {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("INBOX not selected");
      const uidValidity = String(mailbox.uidValidity);
      const uidNext = mailbox.uidNext;
      const unseenSeqs = await client.search({ seen: false });
      const unseen = unseenSeqs ? unseenSeqs.length : 0;
      const known = target.uidValidity === uidValidity ? target.uidNext : null;
      if (known === null || uidNext <= known) {
        return { ...head, ok: true, uidValidity, uidNext, unseen, newCount: 0, newMessages: [] };
      }
      const fresh: { uid: number; from: string; subject: string }[] = [];
      for await (const msg of client.fetch(
        `${known}:*`,
        { uid: true, flags: true, envelope: true },
        { uid: true },
      )) {
        // `N:*` always matches the newest message, even when N is past it.
        if (msg.uid < known || msg.flags?.has("\\Seen")) continue;
        fresh.push({
          uid: msg.uid,
          from: senderLabel(msg.envelope?.from),
          subject: msg.envelope?.subject ?? "",
        });
      }
      fresh.sort((a, b) => b.uid - a.uid);
      return {
        ...head,
        ok: true,
        uidValidity,
        uidNext,
        unseen,
        newCount: fresh.length,
        newMessages: fresh.slice(0, NOTIFY_NEWEST),
      };
    });
  } catch (error) {
    if (error instanceof MailAuthError) return { ...head, ok: false, error: "auth" };
    console.warn(`[mail.poll] ${target.email}: ${(error as Error).message}`);
    return { ...head, ok: false, error: "connect" };
  }
}
