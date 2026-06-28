/**
 * Shared Tailwind class maps for status/severity chips, so the same colour
 * language is used everywhere (devices table, health page) and lives in one
 * place. Ported from ActivityTrack; tokens mapped onto the intranet theme
 * (`ok`/`warn`/`danger`/`muted-foreground`). Labels stay inline at the call
 * site since they're translated via t().
 */

export type DeviceStatus = "pending" | "active" | "disabled";

export const DEVICE_STATUS_CLASS: Record<DeviceStatus, string> = {
  pending: "bg-warn/20 text-warn",
  active: "bg-ok/20 text-ok",
  disabled: "bg-danger/20 text-danger",
};

export type Severity = "info" | "warning" | "error" | "critical";

export const SEVERITY_DOT_CLASS: Record<Severity, string> = {
  info: "bg-muted-foreground",
  warning: "bg-warn",
  error: "bg-danger",
  critical: "bg-danger",
};

export const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  info: "bg-muted-foreground/10 text-muted-foreground",
  warning: "bg-warn/15 text-warn",
  error: "bg-danger/15 text-danger",
  critical: "bg-danger/25 text-danger",
};
