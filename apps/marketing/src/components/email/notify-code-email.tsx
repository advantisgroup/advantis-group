import type React from "react";

import deMessages from "@/i18n/messages/de.json";
import enMessages from "@/i18n/messages/en.json";
import frMessages from "@/i18n/messages/fr.json";
import zhMessages from "@/i18n/messages/zh.json";

import { mail, mailStyles as s } from "./theme";

const localeMessages: Record<string, typeof deMessages> = {
  de: deMessages,
  en: enMessages,
  fr: frMessages,
  zh: zhMessages,
};

export const notifyCodeCopy = (locale: string) =>
  (localeMessages[locale] || deMessages).contact.notify.codeEmail;

/** The six-digit code that proves someone owns the address they typed in. */
export function NotifyCodeEmail({
  code,
  action,
  locale,
}: {
  code: string;
  action: "subscribe" | "unsubscribe";
  locale: string;
}) {
  const t = notifyCodeCopy(locale);

  return (
    <div style={s.body}>
      <div style={s.container}>
        <p style={s.brand}>ADVANTIS GROUP</p>
        <h1 style={s.heading}>{action === "subscribe" ? t.subscribeTitle : t.unsubscribeTitle}</h1>
        <p style={s.text}>{action === "subscribe" ? t.subscribeBody : t.unsubscribeBody}</p>
        <p style={codeStyle}>{code}</p>
        <p style={s.muted}>{t.expiry}</p>
        <div style={s.rule} />
        <p style={s.muted}>{t.disclaimer}</p>
        <p style={s.footer}>
          ADVANTIS GROUP ·{" "}
          <a href="https://advantisgroup.de" style={s.link}>
            advantisgroup.de
          </a>
        </p>
      </div>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  backgroundColor: mail.card,
  border: `1px solid ${mail.rule}`,
  borderRadius: "8px",
  color: mail.ink,
  fontFamily: '"SFMono-Regular",Menlo,Consolas,monospace',
  fontSize: "32px",
  fontWeight: 600,
  letterSpacing: "8px",
  margin: "8px 0 20px",
  padding: "16px 0",
  textAlign: "center",
};
