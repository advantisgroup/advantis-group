import type React from "react";

/**
 * The site's palette as hex, for mail clients that can't read CSS variables:
 * warm paper, warm ink, hairlines, and the Advantis pink from the mark —
 * used for one small thing per mail, never a fill.
 */
export const mail = {
  paper: "#F8F6F1",
  card: "#FDFCFA",
  ink: "#25211D",
  muted: "#6E6962",
  rule: "#E5E1D9",
  accent: "#EE4767",
  danger: "#B4382F",
  sans: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  // echoes the site's Newsreader headlines where the web font can't load
  serif: 'Georgia,"Times New Roman",serif',
} as const;

export const mailStyles = {
  body: {
    backgroundColor: mail.paper,
    fontFamily: mail.sans,
    color: mail.ink,
    margin: 0,
    padding: "40px 16px",
  },
  container: { maxWidth: "560px", margin: "0 auto" },
  brand: {
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.14em",
    color: mail.ink,
    margin: "0 0 32px",
  },
  heading: {
    fontFamily: mail.serif,
    fontSize: "26px",
    fontWeight: 400,
    lineHeight: 1.25,
    color: mail.ink,
    margin: "0 0 16px",
  },
  text: { fontSize: "15px", lineHeight: 1.6, color: mail.ink, margin: "0 0 14px" },
  muted: { fontSize: "13px", lineHeight: 1.6, color: mail.muted, margin: "0 0 14px" },
  rule: { borderTop: `1px solid ${mail.rule}`, margin: "28px 0" },
  label: { fontSize: "12px", color: mail.muted, margin: "0 0 2px" },
  value: { fontSize: "15px", color: mail.ink, margin: "0 0 12px", whiteSpace: "pre-wrap" },
  quote: {
    fontSize: "15px",
    lineHeight: 1.6,
    color: mail.ink,
    margin: "0 0 14px",
    padding: "0 0 0 14px",
    borderLeft: `2px solid ${mail.rule}`,
    whiteSpace: "pre-wrap",
  },
  button: {
    display: "inline-block",
    backgroundColor: mail.ink,
    color: mail.paper,
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    padding: "11px 20px",
    borderRadius: "999px",
  },
  link: { color: mail.ink, textDecoration: "underline" },
  footer: { fontSize: "12px", lineHeight: 1.6, color: mail.muted, margin: 0 },
} satisfies Record<string, React.CSSProperties>;
