import type React from "react";

import deMessages from "@/i18n/messages/de.json";
import enMessages from "@/i18n/messages/en.json";
import frMessages from "@/i18n/messages/fr.json";
import zhMessages from "@/i18n/messages/zh.json";

import { mailStyles as s } from "./theme";

const localeMessages: Record<string, typeof deMessages> = {
  de: deMessages,
  en: enMessages,
  fr: frMessages,
  zh: zhMessages,
};

function resolve(locale: string) {
  return (localeMessages[locale] || deMessages).whitepaper.email;
}

interface ConfirmEmailProps {
  firstName: string;
  lastName: string;
  confirmUrl: string;
  locale: string;
}

interface DeliveryEmailProps {
  firstName: string;
  lastName: string;
  locale: string;
}

/** Step one of the double opt-in: nothing is sent until this link is opened. */
export function WhitepaperConfirmEmail({
  firstName,
  lastName,
  confirmUrl,
  locale,
}: ConfirmEmailProps) {
  const t = resolve(locale).confirm;

  return (
    <Shell firstName={firstName} lastName={lastName} locale={locale} title={t.title}>
      <p style={s.text}>{t.body}</p>
      <p style={{ margin: "24px 0" }}>
        <a href={confirmUrl} style={s.button}>
          {t.cta}
        </a>
      </p>
      <p style={s.muted}>{t.expiry}</p>
      <p style={{ ...s.muted, wordBreak: "break-word" }}>
        {t.fallback}
        <br />
        <a href={confirmUrl} style={s.link}>
          {confirmUrl}
        </a>
      </p>
      <div style={s.rule} />
      <p style={s.muted}>{t.disclaimer}</p>
    </Shell>
  );
}

/** Step two: the document itself, attached by the confirm route. */
export function WhitepaperDeliveryEmail({ firstName, lastName, locale }: DeliveryEmailProps) {
  const t = resolve(locale).delivery;

  return (
    <Shell firstName={firstName} lastName={lastName} locale={locale} title={t.title}>
      <p style={s.text}>{t.body}</p>
      <p style={s.text}>{t.outro}</p>
      <div style={s.rule} />
      <p style={s.label}>{t.contactEmail}</p>
      <p style={s.value}>{process.env.NEXT_PUBLIC_EMAIL_ADRESS}</p>
      <p style={s.label}>{t.contactPhone}</p>
      <p style={s.value}>{process.env.NEXT_PUBLIC_PHONE_NUMBER}</p>
    </Shell>
  );
}

/** Same frame as the inquiry receipt: paper, one serif heading, a quiet footer. */
function Shell({
  firstName,
  lastName,
  locale,
  title,
  children,
}: {
  firstName: string;
  lastName: string;
  locale: string;
  title: string;
  children: React.ReactNode;
}) {
  const t = resolve(locale);
  const site = "https://advantisgroup.de";

  return (
    <div style={s.body}>
      <div style={s.container}>
        <p style={s.brand}>ADVANTIS GROUP</p>
        <p style={{ ...s.muted, margin: "0 0 6px" }}>
          {t.greeting.replace("{firstName}", firstName).replace("{lastName}", lastName)}
        </p>
        <h1 style={s.heading}>{title}</h1>
        {children}
        <div style={s.rule} />
        <p style={s.footer}>
          © {new Date().getFullYear()} ADVANTIS GROUP · {t.rightsReserved}
          <br />
          <a href={site} style={s.link}>
            advantisgroup.de
          </a>{" "}
          ·{" "}
          <a href={`${site}/${locale in localeMessages ? locale : "de"}/privacy`} style={s.link}>
            {t.privacyLink}
          </a>
        </p>
      </div>
    </div>
  );
}
