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
    <Shell firstName={firstName} lastName={lastName} locale={locale}>
      <div style={highlightBox}>
        <h2 style={highlightHeading}>{t.title}</h2>
        <p style={highlightText}>{t.body}</p>
      </div>

      <table style={ctaTable}>
        <tbody>
          <tr>
            <td style={ctaCell}>
              <a href={confirmUrl} style={ctaButton}>
                {t.cta}
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={mutedText}>{t.expiry}</p>
      <p style={mutedText}>
        {t.fallback}
        <br />
        <a href={confirmUrl} style={link}>
          {confirmUrl}
        </a>
      </p>

      <div style={divider} />
      <p style={mutedText}>{t.disclaimer}</p>
    </Shell>
  );
}

/** Step two: the document itself, attached by the confirm route. */
export function WhitepaperDeliveryEmail({ firstName, lastName, locale }: DeliveryEmailProps) {
  const t = resolve(locale).delivery;

  return (
    <Shell firstName={firstName} lastName={lastName} locale={locale}>
      <div style={highlightBox}>
        <h2 style={highlightHeading}>{t.title}</h2>
        <p style={highlightText}>{t.body}</p>
      </div>

      <p style={bodyText}>{t.outro}</p>

      <div style={divider} />

      <table style={metaTable}>
        <tbody>
          <tr>
            <td style={metaCell}>
              <h3 style={metaLabel}>{t.contactEmail}</h3>
              <p style={metaValue}>{process.env.NEXT_PUBLIC_EMAIL_ADRESS}</p>
            </td>
            <td style={metaCell}>
              <h3 style={metaLabel}>{t.contactPhone}</h3>
              <p style={metaValue}>{process.env.NEXT_PUBLIC_PHONE_NUMBER}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </Shell>
  );
}

function Shell({
  firstName,
  lastName,
  locale,
  children,
}: {
  firstName: string;
  lastName: string;
  locale: string;
  children: React.ReactNode;
}) {
  const t = resolve(locale);

  return (
    <div style={main}>
      <div style={container}>
        <div style={content}>
          <table style={headerTable}>
            <tbody>
              <tr>
                <td>
                  <h1 style={heading}>
                    {t.greeting.replace("{firstName}", firstName).replace("{lastName}", lastName)}
                  </h1>
                </td>
                <td style={badgeCell}>
                  <span style={badge}>{t.badge}</span>
                </td>
              </tr>
            </tbody>
          </table>

          {children}
        </div>

        <div style={footer}>
          <div style={divider} />
          <img
            src="https://advantisgroup.de/base_logo_tb_First.png"
            width="100"
            alt="ADVANTIS GROUP"
            style={footerLogo}
          />
          <p style={copyright}>
            &copy; {new Date().getFullYear()} ADVANTIS GROUP. {t.rightsReserved}
            <br />
            <a href="https://advantisgroup.de" style={link}>
              advantisgroup.de
            </a>
            {" • "}
            <a href="https://advantisgroup.de/privacy" style={link}>
              {t.privacyLink}
            </a>
          </p>
        </div>
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
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "40px 20px",
};

const content: React.CSSProperties = {
  padding: "0 10px",
};

const headerTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: "20px",
};

const heading: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.3",
  margin: "0",
};

const badgeCell: React.CSSProperties = {
  textAlign: "right",
  verticalAlign: "top",
};

const badge: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#fff7f2",
  color: "#DE5618",
  fontSize: "12px",
  fontWeight: "600",
  padding: "4px 12px",
  borderRadius: "12px",
  border: "1px solid #fde6da",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const highlightBox: React.CSSProperties = {
  backgroundColor: "#fff7f2",
  borderRadius: "8px",
  padding: "18px",
  border: "1px solid #fde6da",
  marginBottom: "20px",
};

const highlightHeading: React.CSSProperties = {
  color: "#DE5618",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const highlightText: React.CSSProperties = {
  color: "#1f2937",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0",
};

const bodyText: React.CSSProperties = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 20px",
};

const ctaTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  margin: "0 0 20px",
};

const ctaCell: React.CSSProperties = {
  textAlign: "center",
};

const ctaButton: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#DE5618",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  padding: "14px 28px",
  borderRadius: "8px",
};

const mutedText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 16px",
  wordBreak: "break-word",
};

const divider: React.CSSProperties = {
  borderTop: "1px solid #eaeaea",
  margin: "0 0 24px",
};

const metaTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: "20px",
};

const metaCell: React.CSSProperties = {
  padding: "0 12px 12px 0",
  verticalAlign: "top",
  width: "50%",
};

const metaLabel: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "12px",
  textTransform: "uppercase",
  margin: "0 0 4px",
  letterSpacing: "0.6px",
};

const metaValue: React.CSSProperties = {
  color: "#111827",
  fontSize: "15px",
  margin: "0",
};

const footer: React.CSSProperties = {
  textAlign: "center",
  marginTop: "40px",
};

const footerLogo: React.CSSProperties = {
  display: "inline-block",
  marginBottom: "20px",
  opacity: "0.8",
};

const copyright: React.CSSProperties = {
  color: "#999999",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
};

const link: React.CSSProperties = {
  color: "#DE5618",
  textDecoration: "none",
};
