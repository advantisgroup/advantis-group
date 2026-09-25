import { TEAM_TIME_ZONE } from "@advantis/convex/marketing/inquiry";

import deMessages from "@/i18n/messages/de.json";
import enMessages from "@/i18n/messages/en.json";
import frMessages from "@/i18n/messages/fr.json";
import zhMessages from "@/i18n/messages/zh.json";
import { type ContactMode } from "@/types/contact";

import { mail, mailStyles as s } from "./theme";

const receiptCopy = {
  de: deMessages.email.receipt,
  en: enMessages.email.receipt,
  fr: frMessages.email.receipt,
  zh: zhMessages.email.receipt,
};

type ReceiptLocale = keyof typeof receiptCopy;

const receiptLocale = (locale: string) => (locale in receiptCopy ? locale : "de") as ReceiptLocale;

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

const formatWhen = (at: number, locale: string, timeZone: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone }).format(at);

export type InquiryMailData = {
  id: string;
  reference: string;
  submissionType: ContactMode;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  subject?: string;
  topic?: string;
  message: string;
  notes?: string;
  desiredAt?: number;
  timeZone?: string;
  locale: string;
  /** Who was signed in when it was sent, if anyone. */
  accountEmail?: string;
};

// --- To the team -------------------------------------------------------------------

const TEAM_TYPE = { message: "Nachricht", callback: "Rückruf", other: "Anfrage" } as const;

export function teamSubject(data: InquiryMailData) {
  const name = `${data.firstName} ${data.lastName}`.trim();
  const what =
    data.submissionType === "other" && data.subject
      ? `Anfrage: ${data.subject}`
      : TEAM_TYPE[data.submissionType];
  return [what, name, data.company, data.reference].filter(Boolean).join(" · ");
}

/**
 * The inquiry as the team needs it, always in German whatever language the
 * form was sent in. Reply-to is the customer, so answering is one click.
 */
export function TeamInquiryEmail({
  data,
  intranetUrl,
}: {
  data: InquiryMailData;
  intranetUrl?: string;
}) {
  const name = `${data.firstName} ${data.lastName}`.trim();
  const zone = data.timeZone ?? TEAM_TIME_ZONE;
  const rows: [string, string | undefined][] = [
    ["Referenz", data.reference],
    ["Art", TEAM_TYPE[data.submissionType]],
    ["Name", name],
    ["E-Mail", data.email],
    ["Telefon", data.phone],
    ["Firma", data.company],
    ["Thema", data.topic],
    [
      "Rückruf gewünscht",
      data.desiredAt
        ? `${formatWhen(data.desiredAt, "de", TEAM_TIME_ZONE)}${
            zone !== TEAM_TIME_ZONE
              ? ` (für die Person: ${formatWhen(data.desiredAt, "de", zone)}, ${zone})`
              : ""
          }`
        : undefined,
    ],
    ["Sprache der Website", data.locale.toUpperCase()],
    ["Konto", data.accountEmail || "nicht angemeldet"],
  ];
  const body = data.submissionType === "callback" ? data.notes : data.message;

  return (
    <div style={s.body}>
      <div style={s.container}>
        <p style={s.brand}>ADVANTIS GROUP · WEBSITE</p>
        <h1 style={s.heading}>{teamSubject(data)}</h1>
        {body ? <p style={s.quote}>{body}</p> : null}
        <div style={s.rule} />
        {rows
          .filter((row): row is [string, string] => Boolean(row[1]))
          .map(([label, value]) => (
            <div key={label}>
              <p style={s.label}>{label}</p>
              <p style={s.value}>{value}</p>
            </div>
          ))}
        {intranetUrl ? (
          <p style={{ margin: "24px 0 0" }}>
            <a href={`${intranetUrl}/inquiries/${data.id}`} style={s.button}>
              Im Intranet öffnen
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}

// --- To the customer ---------------------------------------------------------------

export function receiptSubject(data: InquiryMailData) {
  const t = receiptCopy[receiptLocale(data.locale)];
  return fill(data.submissionType === "callback" ? t.subjectCallback : t.subject, {
    reference: data.reference,
  });
}

/**
 * What the customer gets back, in the language they wrote in: that it
 * arrived, what happens next, the reference to quote, and what they sent —
 * never the team's internal summary.
 */
export function InquiryReceiptEmail({
  data,
  inbox,
  siteUrl,
  signedIn,
}: {
  data: InquiryMailData;
  inbox: string;
  siteUrl: string;
  signedIn: boolean;
}) {
  const locale = receiptLocale(data.locale);
  const t = receiptCopy[locale];
  const isCallback = data.submissionType === "callback";
  const zone = data.timeZone ?? TEAM_TIME_ZONE;
  const sent = isCallback ? data.notes : data.message;

  return (
    <div style={s.body}>
      <div style={s.container}>
        <p style={s.brand}>ADVANTIS GROUP</p>
        <h1 style={s.heading}>{fill(t.heading, { firstName: data.firstName })}</h1>
        <p style={s.text}>{isCallback ? t.receivedCallback : t.received}</p>
        {isCallback && data.desiredAt ? (
          <p style={s.text}>
            {fill(t.callbackWhen, {
              phone: data.phone ?? "",
              when: formatWhen(data.desiredAt, locale, zone),
            })}
          </p>
        ) : null}
        <p style={s.text}>{fill(isCallback ? t.nextCallback : t.next, { inbox })}</p>
        <p style={s.muted}>
          {t.reference}: <strong style={{ color: mail.ink }}>{data.reference}</strong>
        </p>

        <p style={{ margin: "24px 0 0" }}>
          <a
            href={
              signedIn
                ? `${siteUrl}/${locale}/account/submissions/${data.id}`
                : `${siteUrl}/${locale}/sign-up?redirect_url=${encodeURIComponent(`/${locale}/account/submissions`)}`
            }
            style={s.button}
          >
            {signedIn ? t.viewInAccount : t.createAccount}
          </a>
        </p>
        {!signedIn ? <p style={{ ...s.muted, marginTop: "12px" }}>{t.keepTrack}</p> : null}

        {sent ? (
          <>
            <div style={s.rule} />
            <p style={s.label}>{t.whatYouSent}</p>
            <p style={s.quote}>{sent}</p>
          </>
        ) : null}

        <div style={s.rule} />
        <p style={s.footer}>
          {t.replyHint}
          <br />© {new Date().getFullYear()} ADVANTIS GROUP ·{" "}
          <a href={siteUrl} style={s.link}>
            advantisgroup.de
          </a>{" "}
          ·{" "}
          <a href={`${siteUrl}/${locale}/privacy`} style={s.link}>
            {t.privacy}
          </a>
        </p>
      </div>
    </div>
  );
}
