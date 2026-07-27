import type React from "react";

import deMessages from "@/i18n/messages/de.json";
import enMessages from "@/i18n/messages/en.json";
import frMessages from "@/i18n/messages/fr.json";
import zhMessages from "@/i18n/messages/zh.json";

interface EmailTemplateProps {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  message: string;
  locale?: string;
  subject: string;
  topic?: string;
  submissionType?: "message" | "callback" | "other";
}

const localeMessages: Record<string, typeof deMessages> = {
  de: deMessages,
  en: enMessages,
  fr: frMessages,
  zh: zhMessages,
};

function getSubmissionTypeLabel(t: (typeof deMessages)["email"], submissionType?: string) {
  switch (submissionType) {
    case "message":
      return t.typeMessage;
    case "callback":
      return t.typeCallback;
    case "other":
      return t.typeOther;
    default:
      return undefined;
  }
}

export function EmailTemplate({
  firstName,
  lastName,
  email,
  phone,
  company,
  message,
  locale = "de",
  subject,
  topic,
  submissionType,
}: EmailTemplateProps) {
  const messages = localeMessages[locale] || deMessages;
  const t = messages.email || deMessages.email;

  const typeLabel = getSubmissionTypeLabel(t, submissionType);

  return (
    <div style={main}>
      <div style={container}>
        <div style={content}>
          {/* Header with greeting + optional type badge */}
          <table style={headerTable}>
            <tbody>
              <tr>
                <td>
                  <h1 style={heading}>
                    {t.greeting.replace("{firstName}", firstName).replace("{lastName}", lastName)}
                  </h1>
                </td>
                {typeLabel && (
                  <td style={badgeCell}>
                    <span style={typeBadge}>{typeLabel}</span>
                  </td>
                )}
              </tr>
            </tbody>
          </table>

          {/* Confirmation block */}
          <div style={confirmationContainer}>
            <h2 style={confirmationHeading}>{t.confirmationTitle}</h2>
            <p style={confirmationText}>{t.confirmationBody}</p>
            {t.bodyIntro && <p style={supportingText}>{t.bodyIntro}</p>}
          </div>

          {/* Response time note */}
          {t.bodyOutro && <p style={outroText}>{t.bodyOutro}</p>}

          <div style={divider} />

          {/* Metadata grid — subject, topic, contact details */}
          <table style={metaTable}>
            <tbody>
              <tr>
                <td style={metaCellLeft}>
                  <h3 style={metaLabel}>{t.subject}</h3>
                  <p style={metaValue}>{subject}</p>
                </td>
                {topic && (
                  <td style={metaCellRight}>
                    <h3 style={metaLabel}>{t.topic}</h3>
                    <p style={metaValue}>{topic}</p>
                  </td>
                )}
              </tr>
              <tr>
                {email && (
                  <td style={metaCellLeft}>
                    <h3 style={metaLabel}>{t.contactEmail}</h3>
                    <p style={metaValue}>{email}</p>
                  </td>
                )}
                {phone && (
                  <td style={email ? metaCellRight : metaCellLeft}>
                    <h3 style={metaLabel}>{t.contactPhone}</h3>
                    <p style={metaValue}>{phone}</p>
                  </td>
                )}
              </tr>
              {company && (
                <tr>
                  <td style={metaCellLeft}>
                    <h3 style={metaLabel}>{t.company}</h3>
                    <p style={metaValue}>{company}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* User message */}
          <p style={messageLabel}>{t.yourMessage}</p>
          <div style={subtleMessageBox}>
            <p style={subtleMessageText}>{message}</p>
          </div>
        </div>

        <div style={footer}>
          <div style={divider} />
          <p style={footerText}>{t.poweredBy}</p>
          <img
            src="https://advantisgroup.de/base_logo_tb_First.png"
            width="100"
            alt="Advantis Group"
            style={footerLogo}
          />

          <p style={copyright}>
            &copy; {new Date().getFullYear()} advantis GmbH. {t.rightsReserved}
            <br />
            <a href="https://advantisgroup.de" style={link}>
              advantisgroup.de
            </a>
            {" • "}
            <a href="https://advantisgroup.de/privacy" style={link}>
              Datenschutzerklärung
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

const typeBadge: React.CSSProperties = {
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

const confirmationContainer: React.CSSProperties = {
  backgroundColor: "#fff7f2",
  borderRadius: "8px",
  padding: "18px",
  border: "1px solid #fde6da",
  marginBottom: "16px",
};

const confirmationHeading: React.CSSProperties = {
  color: "#DE5618",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const confirmationText: React.CSSProperties = {
  color: "#1f2937",
  fontSize: "15px",
  margin: "0 0 8px",
};

const supportingText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  margin: "0",
};

const outroText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 20px",
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

const metaCellLeft: React.CSSProperties = {
  padding: "0 12px 12px 0",
  verticalAlign: "top",
  width: "50%",
};

const metaCellRight: React.CSSProperties = {
  padding: "0 0 12px 12px",
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

const messageLabel: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 10px",
};

const subtleMessageBox: React.CSSProperties = {
  backgroundColor: "#fbfbfb",
  borderRadius: "6px",
  padding: "12px",
  border: "1px solid #f0f0f0",
  borderLeft: "3px solid #DE5618",
  margin: "0 0 20px",
};

const subtleMessageText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0",
  whiteSpace: "pre-wrap",
};

const footer: React.CSSProperties = {
  textAlign: "center",
  marginTop: "40px",
};

const footerText: React.CSSProperties = {
  color: "#888888",
  fontSize: "12px",
  margin: "0 0 10px",
  textTransform: "uppercase",
  letterSpacing: "1px",
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
