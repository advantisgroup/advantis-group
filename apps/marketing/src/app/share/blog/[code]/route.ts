import { type NextRequest, NextResponse } from "next/server";

import { api } from "@advantis/convex/api";
import { ConvexHttpClient } from "convex/browser";

/**
 * `/share/blog/{code}` — the short form of a blog link, redirected to the
 * post's real URL.
 *
 * A redirect rather than a second copy of the page: every link unfurler worth
 * supporting (Slack, WhatsApp, LinkedIn, iMessage, X) follows 3xx before
 * reading OpenGraph, so the preview card still comes from the post page with
 * its full title and image — while the link that gets pasted stays short.
 * It also means one canonical URL, so nothing competes in search.
 *
 * `/share` sits outside the `[locale]` tree (see `proxy.ts`) so the link
 * carries no locale segment; the post's own `language` decides where it
 * lands.
 */

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const post = await convex.query(api.sharing.resolveShare, { code });

  if (!post) {
    return NextResponse.redirect(new URL("/de/blog", request.nextUrl.origin), { status: 307 });
  }

  const target = new URL(`/${post.language}/blog/${post.slug}`, request.nextUrl.origin);
  // Carry the referral through — it's the whole reason the link is tracked,
  // and it has to survive the hop to be recorded on the post's pageview.
  const ref = request.nextUrl.searchParams.get("r");
  if (ref) target.searchParams.set("r", ref);

  // 307 rather than 308: a post can be unpublished, and a permanent redirect
  // would be cached in browsers long after that stopped being true.
  return NextResponse.redirect(target, { status: 307 });
}
