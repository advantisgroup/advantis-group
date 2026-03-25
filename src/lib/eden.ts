/* eslint-disable no-console */
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
const fallbackBaseUrl = dev ? "http://localhost:3000" : "https://advantisgroup.de";
const domain = normalizeBaseUrl(configuredDomain || fallbackBaseUrl);

console.debug(dev, domain, process.env.NODE_ENV);

// this require .api to enter /api prefix
export const api = treaty<App>(domain!).api;
