import { type NextRequest, NextResponse } from "next/server";

import { api } from "@advantis/convex/api";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

type Disposition = "inline" | "attachment";

// Extend this map to add new proxied types — nothing else in the handler needs to change.
const CONTENT_TYPES: Record<string, { disposition: Disposition }> = {
  image: { disposition: "inline" },
  icon: { disposition: "inline" },
  file: { disposition: "attachment" },
};

// Guards against something injected into the templated upstream path (`../`, `%2e%2e`) —
// not a real SSRF guard since the host is fixed to our own Convex deployment.
const STORAGE_ID_RE = /^[a-z0-9]{16,64}$/i;

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\"\r\n]/g, "_").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "download";
}

function debug(storageId: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  console.warn(`[content-proxy] [${timestamp}] ${storageId} - ${message}`, data ?? "");
}

function logError(storageId: string, message: string, error?: unknown) {
  const timestamp = new Date().toISOString();
  console.error(`[content-proxy] [${timestamp}] ${storageId} - ERROR: ${message}`, error ?? "");
}

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
  includeBody: boolean,
) {
  const { type, id: rawId } = await params;
  const requestId = `${type}/${rawId}`;

  debug(requestId, "Request started", { method: req.method, url: req.url });

  const config = CONTENT_TYPES[type];
  if (!config) {
    debug(requestId, "Unknown content type", { type });
    return new NextResponse(null, { status: 404 });
  }

  const dot = rawId.lastIndexOf(".");
  const storageId = dot === -1 ? rawId : rawId.slice(0, dot);

  if (!STORAGE_ID_RE.test(storageId)) {
    debug(requestId, "Invalid storage ID format", { storageId });
    return new NextResponse(null, { status: 400 });
  }

  // Get Clerk auth context. Convex identifies the caller from this JWT, so it
  // must be the "convex" template (see convex/auth.config.ts) — the default
  // session token carries no `email` claim and leaves Convex unauthenticated.
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  debug(storageId, "Auth check", { isAuthenticated: !!token });

  // Check access control via Convex query
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    logError(storageId, "NEXT_PUBLIC_CONVEX_URL not configured");
    return new NextResponse(null, { status: 500 });
  }

  let accessResult: { hasAccess: boolean; reason: string; url?: string | null };
  try {
    const convex = new ConvexHttpClient(convexUrl);
    if (token) convex.setAuth(token);
    debug(storageId, "Checking file access with Convex", {
      hasToken: !!token,
    });

    accessResult = await convex.query(api.files.canAccessFile, {
      storageId,
    });
    debug(storageId, "Access check result", accessResult);

    if (!accessResult.hasAccess) {
      debug(storageId, "Access denied", { isAuthenticated: !!token });
      return new NextResponse(null, { status: 403 });
    }
  } catch (err) {
    logError(storageId, "Failed to check access", err);
    return new NextResponse(null, { status: 502 });
  }

  if (!accessResult.url) {
    logError(storageId, "Convex returned no storage URL for an accessible file");
    return new NextResponse(null, { status: 404 });
  }

  // Fetch from Convex storage via the signed URL Convex just handed us —
  // Convex has no stable public "/api/storage/{id}" endpoint to guess at.
  debug(storageId, "Fetching from Convex storage", {
    url: accessResult.url,
    method: includeBody ? "GET" : "HEAD",
  });

  let upstream: Response;
  try {
    upstream = await fetch(accessResult.url, {
      ...(includeBody ? {} : { method: "HEAD" }),
    });
  } catch (err) {
    logError(storageId, "Fetch from Convex failed", err);
    return new NextResponse(null, { status: 502 });
  }

  if (upstream.status === 404) {
    debug(storageId, "File not found in Convex storage");
    return new NextResponse(null, { status: 404 });
  }

  if (!upstream.ok) {
    logError(storageId, "Convex returned error", { status: upstream.status });
    return new NextResponse(null, { status: 502 });
  }

  const headers = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) headers.set("Content-Type", upstreamType);
  const upstreamLength = upstream.headers.get("content-length");
  if (upstreamLength) headers.set("Content-Length", upstreamLength);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  if (config.disposition === "attachment") {
    const filename = sanitizeFilename(req.nextUrl.searchParams.get("name") ?? rawId);
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    debug(storageId, "Streaming as attachment", { filename });
  } else {
    headers.set("Content-Disposition", "inline");
    debug(storageId, "Streaming inline");
  }

  debug(storageId, "Response ready", {
    contentType: upstreamType,
    contentLength: upstreamLength,
  });

  return new NextResponse(includeBody ? upstream.body : null, {
    status: 200,
    headers,
  });
}

export function GET(req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }) {
  return handle(req, ctx, true);
}

export function HEAD(req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }) {
  return handle(req, ctx, false);
}
