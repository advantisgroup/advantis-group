"use client";

import { useCallback } from "react";

import { type ApiQuery, useApiQuery } from "@/hooks/use-api-query";
import { type IntranetApiClient, useIntranetApiClient } from "@/lib/api-client";

/** Live IONOS inbox reads via apps/api (IMAP, read-only). Nothing is mirrored
 *  in Convex, so these fetch on mount and on `refresh()`. */

export interface MailAddress {
  name: string;
  address: string;
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

export interface InboxPage {
  items: InboxItem[];
  total: number;
  nextBefore: number | null;
}

export interface MailAttachment {
  part: string;
  filename: string;
  contentType: string;
  size: number;
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

export const IONOS_WEBMAIL_URL = "https://mail.ionos.de";

export function fetchInboxPage(api: IntranetApiClient, before?: number): Promise<InboxPage> {
  const query = before ? `?before=${before}` : "";
  return api.fetchJson<InboxPage>(`/mail/inbox${query}`);
}

export function useInbox(enabled: boolean): ApiQuery<InboxPage> {
  const api = useIntranetApiClient();
  return useApiQuery(
    useCallback(() => fetchInboxPage(api), [api]),
    { enabled, source: "mail.inbox" },
  );
}

export function useMailMessage(uid: number | null): ApiQuery<MailMessage> {
  const api = useIntranetApiClient();
  return useApiQuery(
    useCallback(() => api.fetchJson<MailMessage>(`/mail/messages/${uid}`), [api, uid]),
    { enabled: uid !== null, source: "mail.message" },
  );
}

export async function downloadMailAttachment(
  api: IntranetApiClient,
  uid: number,
  attachment: MailAttachment,
): Promise<void> {
  const blob = await api.fetchBlob(
    `/mail/messages/${uid}/attachments/${encodeURIComponent(attachment.part)}`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = attachment.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function setMailAccount(
  api: IntranetApiClient,
  userId: string,
  body: { email: string; password: string },
): Promise<{ ok: true }> {
  return api.fetchJson(`/mail/accounts/${userId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function markMailSeen(
  api: IntranetApiClient,
  uid: number | "all",
): Promise<{ unseen: number }> {
  return api.fetchJson(uid === "all" ? "/mail/seen-all" : `/mail/messages/${uid}/seen`, {
    method: "POST",
  });
}
