import { treaty } from "@elysiajs/eden";

import type { App } from "../app/api/[[...slugs]]/route";

const dev = process.env.NODE_ENV !== "production";
const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const configuredDomain = process.env.NEXT_PUBLIC_DOMAIN;
const runtimeOrigin =
  typeof window !== "undefined" ? window.location.origin : undefined;

if (!configuredDomain && !runtimeOrigin && !dev) {
  throw new Error(
    "NEXT_PUBLIC_DOMAIN must be set for production server-side API requests."
  );
}

const fallbackBaseUrl = runtimeOrigin || "http://localhost:3000";
const domain = normalizeBaseUrl(configuredDomain || fallbackBaseUrl);

// this require .api to enter /api prefix
export const api = treaty<App>(domain).api;
