import deMessages from "@/i18n/messages/de.json";
import enMessages from "@/i18n/messages/en.json";
import frMessages from "@/i18n/messages/fr.json";
import zhMessages from "@/i18n/messages/zh.json";

interface EmailTemplateProps {
  firstName: string;
  lastName: string;
  message: string;
  locale?: string;
  subject: string;
  topic?: string;
}

export function EmailTemplate({
  firstName,
  lastName,
  message,
  locale = "de",
  subject,
  topic,
}: EmailTemplateProps) {
  const messages =
    {
      de: deMessages,
      en: enMessages,
      fr: frMessages,
      zh: zhMessages,
    }[locale] || deMessages;

  const t = messages.email || deMessages.email;

  return (
    <div style={main}>
      <div style={container}>
        <div style={content}>
          <h1 style={heading}>
            {t.greeting
              .replace("{firstName}", firstName)
              .replace("{lastName}", lastName)}
          </h1>

          {/* Prominent confirmation message */}
          <div style={confirmationContainer}>
            <h2 style={confirmationHeading}>Wir haben Ihre Anfrage erhalten</h2>
            <p style={confirmationText}>
              Vielen Dank für Ihre Nachricht. Wir haben Ihr Anliegen erfasst und
              werden uns so schnell wie möglich bei Ihnen melden.
            </p>
            {/* lightweight supporting text (from translations if available) */}
            {t.bodyIntro && <p style={supportingText}>{t.bodyIntro}</p>}
          </div>

          <div style={divider} />

          {/* Subject / Topic */}
          <div style={metaGrid}>
            <div>
              <h3 style={metaLabel}>{t.subject}</h3>
              <p style={metaValue}>{subject}</p>
            </div>
            {topic && (
              <div>
                <h3 style={metaLabel}>{t.topic}</h3>
                <p style={metaValue}>{topic}</p>
              </div>
            )}
          </div>

          {/* User message (de-emphasized) */}
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
            &copy; {new Date().getFullYear()} Advantis Group GmbH.{" "}
            {t.rightsReserved}
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

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  padding: "40px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #f0f0f0",
  borderRadius: "10px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "40px 20px",
};

const content = {
  padding: "0 10px",
};

const heading = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.3",
  margin: "0 0 20px",
};

const messageLabel = {
  color: "#1a1a1a",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 10px",
};

const footer = {
  textAlign: "center" as const,
  marginTop: "40px",
};

const divider = {
  borderTop: "1px solid #eaeaea",
  margin: "0 0 30px",
};

const footerText = {
  color: "#888888",
  fontSize: "12px",
  margin: "0 0 10px",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
};

const footerLogo = {
  display: "inline-block",
  marginBottom: "20px",
  opacity: "0.8",
};

const copyright = {
  color: "#999999",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
};

const link = {
  color: "#DE5618", // Advantis Orange approximation
  textDecoration: "none",
};

// New styles for confirmation and de-emphasized message
const confirmationContainer = {
  backgroundColor: "#fff7f2",
  borderRadius: "8px",
  padding: "18px",
  border: "1px solid #fde6da",
  marginBottom: "20px",
};

const confirmationHeading = {
  color: "#DE5618",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const confirmationText = {
  color: "#1f2937",
  fontSize: "15px",
  margin: "0 0 8px",
};

const supportingText = {
  color: "#6b7280",
  fontSize: "13px",
  margin: "0",
};

const metaGrid = {
  display: "flex",
  gap: "24px",
  marginBottom: "16px",
};

const metaLabel = {
  color: "#6b7280",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  margin: "0 0 4px",
  letterSpacing: "0.6px",
};

const metaValue = {
  color: "#111827",
  fontSize: "15px",
  margin: "0",
};

const subtleMessageBox = {
  backgroundColor: "#fbfbfb",
  borderRadius: "6px",
  padding: "12px",
  border: "1px solid #f0f0f0",
  margin: "0 0 20px",
};

const subtleMessageText = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
};
