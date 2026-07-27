import { treaty } from "@elysiajs/eden";

import type { App } from "@advantis/api";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

/** Typed client for the Advantis API (api.advantisgroup.de). */
export const api = treaty<App>(baseUrl);
