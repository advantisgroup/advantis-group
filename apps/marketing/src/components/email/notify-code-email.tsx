import type React from "react";

import deMessages from "@/i18n/messages/de.json";
import enMessages from "@/i18n/messages/en.json";
import frMessages from "@/i18n/messages/fr.json";
import zhMessages from "@/i18n/messages/zh.json";

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
    <div style={main}>
      <div style={container}>
        <h1 style={heading}>{action === "subscribe" ? t.subscribeTitle : t.unsubscribeTitle}</h1>
        <p style={bodyText}>{action === "subscribe" ? t.subscribeBody : t.unsubscribeBody}</p>
        <p style={codeStyle}>{code}</p>
        <p style={mutedText}>{t.expiry}</p>
        <div style={divider} />
        <p style={mutedText}>{t.disclaimer}</p>
        <p style={footer}>
          ADVANTIS GROUP ·{" "}
          <a href="https://advantisgroup.de" style={link}>
            advantisgroup.de
          </a>
        </p>
      </div>
    </div>
  );
}

/* ── Inline styles (required for email clients) ── */

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  padding: "40px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #f0f0f0",
  borderRadius: "10px",
  margin: "0 auto",
  maxWidth: "480px",
  padding: "36px 30px",
};

const heading: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "22px",
  fontWeight: "600",
  lineHeight: "1.3",
  margin: "0 0 12px",
};

const bodyText: React.CSSProperties = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 24px",
};

const codeStyle: React.CSSProperties = {
  backgroundColor: "#f6f6f4",
  borderRadius: "8px",
  color: "#111827",
  fontFamily: '"SFMono-Regular",Menlo,Consolas,monospace',
  fontSize: "32px",
  fontWeight: "600",
  letterSpacing: "8px",
  margin: "0 0 20px",
  padding: "16px 0",
  textAlign: "center",
};

const mutedText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 16px",
};

const divider: React.CSSProperties = {
  borderTop: "1px solid #eaeaea",
  margin: "8px 0 20px",
};

const footer: React.CSSProperties = {
  color: "#999999",
  fontSize: "12px",
  margin: "0",
};

const link: React.CSSProperties = {
  color: "#DE5618",
  textDecoration: "none",
};
