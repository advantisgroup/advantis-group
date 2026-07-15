import { NextResponse, type NextRequest } from "next/server";

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

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
  includeBody: boolean
) {
  const { type, id: rawId } = await params;

  const config = CONTENT_TYPES[type];
  if (!config) return new NextResponse(null, { status: 404 });

  const dot = rawId.lastIndexOf(".");
  const storageId = dot === -1 ? rawId : rawId.slice(0, dot);
  if (!STORAGE_ID_RE.test(storageId)) {
    return new NextResponse(null, { status: 400 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return new NextResponse(null, { status: 500 });

  const upstream = await fetch(
    `${convexUrl}/api/storage/${storageId}`,
    includeBody ? undefined : { method: "HEAD" }
  );

  if (upstream.status === 404) return new NextResponse(null, { status: 404 });
  if (!upstream.ok) return new NextResponse(null, { status: 502 });

  const headers = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) headers.set("Content-Type", upstreamType);
  const upstreamLength = upstream.headers.get("content-length");
  if (upstreamLength) headers.set("Content-Length", upstreamLength);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  if (config.disposition === "attachment") {
    const filename = sanitizeFilename(req.nextUrl.searchParams.get("name") ?? rawId);
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return new NextResponse(includeBody ? upstream.body : null, {
    status: 200,
    headers,
  });
}

export function GET(
  req: NextRequest,
  ctx: { params: Promise<{ type: string; id: string }> }
) {
  return handle(req, ctx, true);
}

export function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ type: string; id: string }> }
) {
  return handle(req, ctx, false);
}
