import { createHmac, timingSafeEqual } from "node:crypto";

import { Resend } from "resend";

import { Errors } from "./errors.js";

/**
 * Mails to website customers about their inquiry, sent when the team acts on
 * it in the intranet (Convex `marketing/mail.ts` calls
 * `/internal/notifications`). They look like the marketing site's own mails
 * — its palette, its sender — not the intranet's, and speak the language the
 * inquiry was sent in. See docs/inquiries.md.
 */

export const INQUIRY_MAIL_KINDS = [
  "inquiry-update",
  "inquiry-reply",
  "callback-confirmed",
  "callback-cancelled",
  "forms-reopened",
] as const;
export type InquiryMailKind = (typeof INQUIRY_MAIL_KINDS)[number];

const SITE = (process.env.MARKETING_URL ?? "https://advantisgroup.de").replace(/\/+$/, "");
// the team inbox: sender of these mails and where a plain reply lands
const INBOX = process.env.MARKETING_INBOX;
const FROM = INBOX ? `ADVANTIS GROUP <${INBOX}>` : "ADVANTIS GROUP <noreply@advantisgroup.de>";

let resend: Resend | null = null;
function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw Errors.internal("RESEND_API_KEY not configured");
  resend ??= new Resend(key);
  return resend;
}

// --- Reply-by-email addresses -----------------------------------------------------

const signature = (inquiryId: string, secret: string) =>
  createHmac("sha256", secret).update(inquiryId).digest("hex").slice(0, 16);

/** `reply+<id>.<sig>@<domain>` when inbound mail is set up in Resend, else the team inbox. */
export function replyAddress(inquiryId: string): string | undefined {
  const domain = process.env.INQUIRY_INBOUND_DOMAIN;
  const secret = process.env.INQUIRY_REPLY_SECRET;
  if (!domain || !secret) return INBOX;
  return `reply+${inquiryId}.${signature(inquiryId, secret)}@${domain}`;
}

/** The inquiry an inbound address belongs to, if its signature checks out. */
export function inquiryFromReplyAddress(address: string): string | null {
  const secret = process.env.INQUIRY_REPLY_SECRET;
  const match = /reply\+([a-z0-9]+)\.([a-f0-9]{16})@/i.exec(address);
  if (!secret || !match) return null;
  const [, id, sig] = match;
  const expected = Buffer.from(signature(id, secret));
  const given = Buffer.from(sig.toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** The reply above the quoted original: mail clients append the whole thread otherwise. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((line) =>
    /^(>|On .+wrote:|Am .+schrieb|Le .+a écrit|-{2,}\s*(Original|Ursprüngliche)|From: |Von: )/i.test(
      line.trim(),
    ),
  );
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}

// --- Copy ---------------------------------------------------------------------------

type Locale = "de" | "en" | "fr" | "zh";

const COPY = {
  en: {
    view: "View your inquiry",
    signInHint: "Sign in (or create an account) with {email} to see it.",
    reference: "Reference",
    footer: "You're receiving this because you contacted ADVANTIS GROUP.",
    privacy: "Privacy",
    update: {
      subject: "Update on your inquiry {reference}",
      in_progress: ["We're on it", "Someone from our team is working on your inquiry now."],
      answered: ["We've answered your inquiry", "There's an answer waiting for you."],
    },
    reply: {
      subject: "A reply to your inquiry {reference}",
      heading: "{name} from ADVANTIS GROUP replied",
      headingTeam: "We've replied",
      viaMail: "You can answer by replying to this email.",
      viaPage: "Answer on your inquiry's page.",
    },
    confirmed: {
      subject: "Your callback is confirmed · {reference}",
      heading: "Talk soon",
      body: "We'll call you on {phone} on {when}.",
      invite: "The calendar invitation is attached.",
      reschedule: "Pick another time",
      cancel: "Cancel the callback",
    },
    cancelled: {
      subject: "Your callback is cancelled · {reference}",
      heading: "Callback cancelled",
      body: "We've cancelled the callback on {when}. If you'd still like to talk, pick a new time any time.",
      another: "Request a new callback",
    },
    reopened: {
      subject: "Our contact forms are open again",
      heading: "We're taking inquiries again",
      body: "You asked us to let you know: the contact forms on our website are open again.",
      cta: "Get in touch",
      once: "This was a one-off note, so you're off the list now.",
    },
  },
  de: {
    view: "Anfrage ansehen",
    signInHint: "Melde dich mit {email} an (oder erstelle ein Konto), um sie zu sehen.",
    reference: "Referenz",
    footer: "Du bekommst diese E-Mail, weil du ADVANTIS GROUP kontaktiert hast.",
    privacy: "Datenschutz",
    update: {
      subject: "Neues zu deiner Anfrage {reference}",
      in_progress: ["Wir sind dran", "Jemand aus unserem Team bearbeitet deine Anfrage gerade."],
      answered: ["Wir haben deine Anfrage beantwortet", "Eine Antwort wartet auf dich."],
    },
    reply: {
      subject: "Antwort auf deine Anfrage {reference}",
      heading: "{name} von ADVANTIS GROUP hat geantwortet",
      headingTeam: "Wir haben geantwortet",
      viaMail: "Du kannst einfach auf diese E-Mail antworten.",
      viaPage: "Antworte auf der Seite deiner Anfrage.",
    },
    confirmed: {
      subject: "Dein Rückruf ist bestätigt · {reference}",
      heading: "Bis gleich am Telefon",
      body: "Wir rufen dich am {when} unter {phone} an.",
      invite: "Die Kalendereinladung hängt an.",
      reschedule: "Anderen Termin wählen",
      cancel: "Rückruf absagen",
    },
    cancelled: {
      subject: "Dein Rückruf ist abgesagt · {reference}",
      heading: "Rückruf abgesagt",
      body: "Wir haben den Rückruf am {when} abgesagt. Wenn du trotzdem sprechen möchtest, wähl jederzeit einen neuen Termin.",
      another: "Neuen Rückruf anfordern",
    },
    reopened: {
      subject: "Unsere Kontaktformulare sind wieder offen",
      heading: "Wir nehmen wieder Anfragen an",
      body: "Du wolltest Bescheid bekommen: Die Kontaktformulare auf unserer Website sind wieder offen.",
      cta: "Kontakt aufnehmen",
      once: "Das war eine einmalige Nachricht, du bist jetzt von der Liste.",
    },
  },
  fr: {
    view: "Voir votre demande",
    signInHint: "Connectez-vous (ou créez un compte) avec {email} pour la voir.",
    reference: "Référence",
    footer: "Vous recevez cet e-mail parce que vous avez contacté ADVANTIS GROUP.",
    privacy: "Confidentialité",
    update: {
      subject: "Du nouveau sur votre demande {reference}",
      in_progress: ["Nous nous en occupons", "Un membre de notre équipe traite votre demande."],
      answered: ["Nous avons répondu à votre demande", "Une réponse vous attend."],
    },
    reply: {
      subject: "Réponse à votre demande {reference}",
      heading: "{name} d'ADVANTIS GROUP a répondu",
      headingTeam: "Nous avons répondu",
      viaMail: "Vous pouvez répondre directement à cet e-mail.",
      viaPage: "Répondez sur la page de votre demande.",
    },
    confirmed: {
      subject: "Votre rappel est confirmé · {reference}",
      heading: "À très bientôt au téléphone",
      body: "Nous vous appellerons au {phone} le {when}.",
      invite: "L'invitation de calendrier est jointe.",
      reschedule: "Choisir un autre horaire",
      cancel: "Annuler le rappel",
    },
    cancelled: {
      subject: "Votre rappel est annulé · {reference}",
      heading: "Rappel annulé",
      body: "Nous avons annulé le rappel du {when}. Si vous souhaitez toujours échanger, choisissez un nouvel horaire quand vous voulez.",
      another: "Demander un nouveau rappel",
    },
    reopened: {
      subject: "Nos formulaires de contact sont à nouveau ouverts",
      heading: "Nous acceptons de nouveau les demandes",
      body: "Vous nous aviez demandé de vous prévenir : les formulaires de contact de notre site sont à nouveau ouverts.",
      cta: "Nous contacter",
      once: "C'était un message unique, vous avez été retiré de la liste.",
    },
  },
  zh: {
    view: "查看您的咨询",
    signInHint: "使用 {email} 登录（或创建账户）即可查看。",
    reference: "参考编号",
    footer: "您收到此邮件是因为您联系过 ADVANTIS GROUP。",
    privacy: "隐私政策",
    update: {
      subject: "您的咨询 {reference} 有新进展",
      in_progress: ["我们正在处理", "我们的团队成员正在处理您的咨询。"],
      answered: ["我们已回复您的咨询", "有一条回复等待您查看。"],
    },
    reply: {
      subject: "关于您的咨询 {reference} 的回复",
      heading: "ADVANTIS GROUP 的 {name} 回复了您",
      headingTeam: "我们已回复",
      viaMail: "您可以直接回复此邮件。",
      viaPage: "请在咨询页面上回复。",
    },
    confirmed: {
      subject: "您的回电已确认 · {reference}",
      heading: "电话里见",
      body: "我们将于 {when} 致电 {phone}。",
      invite: "日历邀请已附上。",
      reschedule: "选择其他时间",
      cancel: "取消回电",
    },
    cancelled: {
      subject: "您的回电已取消 · {reference}",
      heading: "回电已取消",
      body: "我们已取消 {when} 的回电。如仍需沟通，随时可以选择新的时间。",
      another: "请求新的回电",
    },
    reopened: {
      subject: "我们的联系表单已重新开放",
      heading: "我们重新开始受理咨询",
      body: "您曾请我们通知您：网站上的联系表单已重新开放。",
      cta: "联系我们",
      once: "这是一次性通知，您已被移出名单。",
    },
  },
} as const;

const asLocale = (value: unknown): Locale =>
  value === "en" || value === "fr" || value === "zh" ? value : "de";

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const when = (at: number, locale: Locale, timeZone?: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timeZone ?? "Europe/Berlin",
  }).format(at);

// --- Layout (the marketing site's palette; see apps/marketing/src/components/email/theme.ts) ---

const INK = "#25211D";
const MUTED = "#6E6962";
const RULE = "#E5E1D9";

function layout(locale: Locale, heading: string, body: string, footerExtra = ""): string {
  const t = COPY[locale];
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#F8F6F1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;text-align:left">
        <tr><td style="font-size:12px;font-weight:600;letter-spacing:0.14em;padding:0 0 32px">ADVANTIS GROUP</td></tr>
        <tr><td><h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25">${heading}</h1>${body}</td></tr>
        <tr><td style="border-top:1px solid ${RULE};padding:20px 0 0;margin-top:28px;color:${MUTED};font-size:12px;line-height:1.6">${footerExtra}${t.footer}<br />© ${new Date().getFullYear()} ADVANTIS GROUP · <a href="${SITE}" style="color:${INK}">advantisgroup.de</a> · <a href="${SITE}/${locale}/privacy" style="color:${INK}">${t.privacy}</a></td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${text}</p>`;
const muted = (text: string) =>
  `<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${MUTED}">${text}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:${INK};color:#F8F6F1;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600;font-size:14px">${label}</a></p>`;
const link = (href: string, label: string) => `<a href="${href}" style="color:${INK}">${label}</a>`;
const quote = (text: string) =>
  `<p style="margin:0 0 14px;padding:0 0 0 14px;border-left:2px solid ${RULE};font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(text)}</p>`;

type Data = Record<string, unknown>;
const str = (d: Data, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const num = (d: Data, k: string) => (typeof d[k] === "number" ? (d[k] as number) : undefined);

type Rendered = {
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
};

function render(kind: InquiryMailKind, to: string, data: Data): Rendered {
  const locale = asLocale(data.locale);
  const t = COPY[locale];
  const reference = str(data, "reference");
  const inquiryUrl = `${SITE}/${locale}/account/submissions/${str(data, "inquiryId")}`;
  const refLine = muted(`${t.reference}: <strong style="color:${INK}">${esc(reference)}</strong>`);
  const viewButton = button(inquiryUrl, t.view) + muted(fill(t.signInHint, { email: esc(to) }));

  switch (kind) {
    case "inquiry-update": {
      const state = str(data, "state") === "answered" ? "answered" : "in_progress";
      const [heading, body] = t.update[state];
      return {
        subject: fill(t.update.subject, { reference }),
        html: layout(locale, heading, p(body) + refLine + viewButton),
        replyTo: INBOX,
      };
    }
    case "inquiry-reply": {
      const name = str(data, "staffName");
      const replyTo = replyAddress(str(data, "inquiryId"));
      const byMail = replyTo !== INBOX;
      return {
        subject: fill(t.reply.subject, { reference }),
        html: layout(
          locale,
          name ? fill(t.reply.heading, { name: esc(name) }) : t.reply.headingTeam,
          quote(str(data, "body")) +
            refLine +
            button(inquiryUrl, t.view) +
            muted(byMail ? t.reply.viaMail : t.reply.viaPage),
        ),
        replyTo,
      };
    }
    case "callback-confirmed": {
      const startAt = num(data, "startAt") ?? Date.now();
      const token = encodeURIComponent(str(data, "token"));
      const actions = `${SITE}/${locale}/callback?token=${token}`;
      return {
        subject: fill(t.confirmed.subject, { reference }),
        html: layout(
          locale,
          t.confirmed.heading,
          p(
            fill(t.confirmed.body, {
              phone: esc(str(data, "phone")),
              when: esc(when(startAt, locale, str(data, "timeZone") || undefined)),
            }),
          ) +
            muted(t.confirmed.invite) +
            refLine +
            p(
              `${link(actions, t.confirmed.reschedule)} · ${link(`${actions}&action=cancel`, t.confirmed.cancel)}`,
            ),
        ),
        replyTo: INBOX,
        attachments: str(data, "ics")
          ? [
              {
                filename: `${reference || "callback"}.ics`,
                content: Buffer.from(str(data, "ics")).toString("base64"),
                contentType: "text/calendar; method=REQUEST",
              },
            ]
          : undefined,
      };
    }
    case "callback-cancelled": {
      const startAt = num(data, "startAt");
      return {
        subject: fill(t.cancelled.subject, { reference }),
        html: layout(
          locale,
          t.cancelled.heading,
          p(
            fill(t.cancelled.body, {
              when: startAt ? esc(when(startAt, locale, str(data, "timeZone") || undefined)) : "",
            }),
          ) +
            refLine +
            button(`${SITE}/${locale}/contact?mode=callback`, t.cancelled.another),
        ),
        replyTo: INBOX,
        attachments: str(data, "ics")
          ? [
              {
                filename: `${reference || "callback"}.ics`,
                content: Buffer.from(str(data, "ics")).toString("base64"),
                contentType: "text/calendar; method=CANCEL",
              },
            ]
          : undefined,
      };
    }
    case "forms-reopened":
      return {
        subject: t.reopened.subject,
        html: layout(
          locale,
          t.reopened.heading,
          p(t.reopened.body) + button(`${SITE}/${locale}/contact`, t.reopened.cta),
          `${t.reopened.once}<br />`,
        ),
        replyTo: INBOX,
      };
  }
}

export const isInquiryMailKind = (kind: string): kind is InquiryMailKind =>
  (INQUIRY_MAIL_KINDS as readonly string[]).includes(kind);

export async function sendInquiryMail(kind: InquiryMailKind, to: string, data: Data) {
  const { subject, html, replyTo, attachments } = render(kind, to, data);
  const { error } = await client().emails.send({
    from: FROM,
    to,
    subject,
    html,
    replyTo,
    attachments,
  });
  if (error) throw Errors.upstream(`Resend error: ${error.message}`);
}

/** The text of a mail Resend received on the inbound domain. */
export async function receivedText(emailId: string) {
  const { data, error } = await client().emails.receiving.get(emailId);
  if (error || !data) throw Errors.upstream(`Resend error: ${error?.message ?? "no data"}`);
  return { from: data.from, text: data.text ?? "", to: [...data.to, ...(data.received_for ?? [])] };
}
