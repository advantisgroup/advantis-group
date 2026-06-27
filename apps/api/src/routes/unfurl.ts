import { Elysia, t } from "elysia";

import { type UnfurlResult } from "@advantis/types";

import { Errors } from "../lib/errors";
import { requireAuth } from "../lib/middleware";
import { rateLimit } from "../lib/rate-limit";

const MAX_BYTES = 512 * 1024; // only read the first 512KB of <head>

function metaContent(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function ogPattern(prop: string): RegExp {
  return new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
}

/** GET /unfurl?url= — fetch Open Graph metadata for a link preview. */
export const unfurlRoute = new Elysia().get(
  "/unfurl",
  async ({ request, query }) => {
    const { clerkUserId } = await requireAuth(request);
    await rateLimit("unfurl", clerkUserId, 30, "1 m");

    let target: URL;
    try {
      target = new URL(query.url);
    } catch {
      throw Errors.badRequest("Invalid url");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw Errors.badRequest("Only http(s) urls are supported");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let html = "";
    try {
      const res = await fetch(target.toString(), {
        signal: controller.signal,
        headers: { "user-agent": "AdvantisIntranetBot/1.0 (+link-preview)" },
        redirect: "follow",
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/html")) {
        return { url: target.toString() } satisfies UnfurlResult;
      }
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (received >= MAX_BYTES || /<\/head>/i.test(html)) {
            await reader.cancel();
            break;
          }
        }
      }
    } catch {
      return { url: target.toString() } satisfies UnfurlResult;
    } finally {
      clearTimeout(timeout);
    }

    const title =
      metaContent(html, [ogPattern("og:title"), ogPattern("twitter:title")]) ??
      metaContent(html, [/<title[^>]*>([^<]+)<\/title>/i]);
    const result: UnfurlResult = {
      url: target.toString(),
      title,
      description: metaContent(html, [
        ogPattern("og:description"),
        ogPattern("twitter:description"),
        ogPattern("description"),
      ]),
      image: metaContent(html, [
        ogPattern("og:image"),
        ogPattern("twitter:image"),
      ]),
      siteName: metaContent(html, [ogPattern("og:site_name")]),
    };
    return result;
  },
  {
    query: t.Object({ url: t.String() }),
    response: {
      200: t.Object({
        url: t.String(),
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        image: t.Optional(t.String()),
        siteName: t.Optional(t.String()),
      }),
    },
  }
);
