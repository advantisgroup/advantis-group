import { type DriveQuota } from "@advantis/types";

import { Errors } from "../errors.js";
import { requireEnv } from "../env.js";
import { folderConfig, normalizePath } from "./access.js";

/**
 * Microsoft Graph (OneDrive) client. App-only client-credentials flow against a
 * single service account; the token is cached in-process with an expiry buffer
 * (same shape as the Genesys client). Every failure is funnelled through
 * `graphFetch` and mapped to our `ApiError` taxonomy — raw Graph error bodies
 * and secrets never reach the caller, only get logged server-side.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SMALL_UPLOAD_LIMIT = 4 * 1024 * 1024; // Graph's simple-PUT ceiling
const UPLOAD_CHUNK = 5 * 1024 * 1024; // multiple of 320 KiB, per Graph rules

// --- Auth -------------------------------------------------------------------

let token: { accessToken: string; expiresAt: number } | null = null;

async function getToken(force = false): Promise<string> {
  if (!force && token && Date.now() < token.expiresAt) return token.accessToken;
  const tenant = requireEnv("MS_GRAPH_TENANT_ID");
  const body = new URLSearchParams({
    client_id: requireEnv("MS_GRAPH_CLIENT_ID"),
    client_secret: requireEnv("MS_GRAPH_CLIENT_SECRET"),
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) {
    console.error(`[onedrive] token request failed: ${res.status}`);
    throw Errors.upstream("Could not authenticate with OneDrive");
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return token.accessToken;
}

// --- Low-level fetch with error mapping + throttle handling -----------------

function mapStatus(status: number, context: string): never {
  if (status === 401 || status === 403) {
    throw Errors.forbidden("OneDrive denied the request");
  }
  if (status === 404) throw Errors.notFound("File or folder not found");
  if (status === 409) throw Errors.badRequest("A conflicting item already exists");
  if (status === 423) throw Errors.badRequest("The item is locked");
  if (status === 429) throw Errors.rateLimited("OneDrive is throttling requests");
  if (status >= 500) throw Errors.upstream("OneDrive is temporarily unavailable");
  console.error(`[onedrive] ${context} failed: ${status}`);
  throw Errors.upstream("OneDrive request failed");
}

interface FetchOpts {
  /** Skip JSON parse (caller wants the raw Response, e.g. downloads). */
  raw?: boolean;
}

async function graphRequest(
  path: string,
  init: RequestInit,
  context: string
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const accessToken = await getToken(refreshed);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch (error) {
      console.error(`[onedrive] ${context} network error:`, error);
      throw Errors.upstream("Could not reach OneDrive");
    }
    // Token rotated/expired mid-flight — refresh once and retry.
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      continue;
    }
    // Honour Graph throttling with bounded backoff.
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 1000, 8000);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) mapStatus(res.status, context);
    return res;
  }
}

async function graphFetch<T>(
  path: string,
  init: RequestInit = {},
  context = "request",
  opts: FetchOpts = {}
): Promise<T> {
  const res = await graphRequest(path, init, context);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Drive addressing -------------------------------------------------------

function driveBase(): string {
  const user = requireEnv("ONEDRIVE_DRIVE_USER");
  return `/users/${encodeURIComponent(user)}/drive`;
}

function encodePath(fullPath: string): string {
  return fullPath
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

/** Full drive-root-relative path for an AG-relative path. */
function fullPath(relPath: string): string {
  const { root } = folderConfig();
  const rel = normalizePath(relPath);
  return rel ? `${normalizePath(root)}/${rel}` : normalizePath(root);
}

/** Graph URL that addresses an AG-relative path. */
function pathUrl(relPath: string, suffix = ""): string {
  const full = fullPath(relPath);
  if (!full) return `${driveBase()}/root${suffix}`;
  return `${driveBase()}/root:/${encodePath(full)}:${suffix}`;
}

const itemUrl = (id: string, suffix = ""): string =>
  `${driveBase()}/items/${encodeURIComponent(id)}${suffix}`;

// --- Item shapes ------------------------------------------------------------

export interface GraphItem {
  id: string;
  name: string;
  size?: number;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  lastModifiedDateTime?: string;
  parentReference?: { path?: string; id?: string };
  webUrl?: string;
}

const SELECT =
  "$select=id,name,size,file,folder,lastModifiedDateTime,parentReference,webUrl";

/** AG-relative path of an item, or null when it lives outside the AG root. */
export function relPathOf(item: GraphItem): string | null {
  const prefix = "/drive/root:";
  let parent = item.parentReference?.path ?? "";
  if (parent.startsWith(prefix)) parent = parent.slice(prefix.length);
  parent = parent.replace(/^\/+/, "");
  const full = normalizePath(parent ? `${parent}/${item.name}` : item.name);
  const root = normalizePath(fullPath(""));
  if (full === root) return "";
  if (full.startsWith(`${root}/`)) return full.slice(root.length + 1);
  return null;
}

// --- Read operations --------------------------------------------------------

export async function getItemById(id: string): Promise<GraphItem> {
  return graphFetch<GraphItem>(itemUrl(id, `?${SELECT}`), {}, "getItem");
}

export async function getItemByPath(relPath: string): Promise<GraphItem> {
  return graphFetch<GraphItem>(pathUrl(relPath, `?${SELECT}`), {}, "getItemByPath");
}

interface ChildrenPage {
  value: GraphItem[];
  "@odata.nextLink"?: string;
}

export async function listChildrenById(id: string): Promise<GraphItem[]> {
  const items: GraphItem[] = [];
  let url: string | undefined = itemUrl(id, `/children?${SELECT}&$top=200`);
  while (url) {
    const page: ChildrenPage = await graphFetch(url, {}, "listChildren");
    items.push(...page.value);
    url = page["@odata.nextLink"];
  }
  return items;
}

export async function getQuota(): Promise<DriveQuota> {
  const drive = await graphFetch<{
    quota?: { used?: number; total?: number; remaining?: number };
  }>(`${driveBase()}?$select=quota`, {}, "quota");
  const q = drive.quota ?? {};
  const total = q.total ?? 0;
  const used = q.used ?? 0;
  return { used, total, remaining: q.remaining ?? Math.max(total - used, 0) };
}

export async function downloadById(id: string): Promise<Response> {
  return graphFetch<Response>(
    itemUrl(id, "/content"),
    { redirect: "follow" },
    "download",
    { raw: true }
  );
}

export async function getThumbnailUrl(id: string): Promise<string | undefined> {
  try {
    const res = await graphFetch<{
      value: { large?: { url?: string }; medium?: { url?: string } }[];
    }>(itemUrl(id, "/thumbnails"), {}, "thumbnails");
    const set = res.value?.[0];
    return set?.large?.url ?? set?.medium?.url;
  } catch {
    return undefined; // thumbnails are best-effort, never fatal
  }
}

export async function getPreviewUrl(id: string): Promise<string | undefined> {
  const res = await graphFetch<{ getUrl?: string }>(
    itemUrl(id, "/preview"),
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    "preview"
  );
  return res.getUrl;
}

/** Search the whole drive, then keep only hits inside the AG root. */
export async function search(query: string): Promise<GraphItem[]> {
  const q = encodeURIComponent(query.replace(/'/g, "''"));
  const res = await graphFetch<ChildrenPage>(
    `${driveBase()}/root/search(q='${q}')?${SELECT}&$top=100`,
    {},
    "search"
  );
  return res.value.filter(item => relPathOf(item) !== null);
}

// --- Write operations -------------------------------------------------------

export async function createFolder(
  parentId: string,
  name: string
): Promise<GraphItem> {
  return graphFetch<GraphItem>(
    itemUrl(parentId, "/children"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    },
    "createFolder"
  );
}

export async function renameOrMove(
  id: string,
  patch: { name?: string; parentId?: string }
): Promise<GraphItem> {
  const body: Record<string, unknown> = {};
  if (patch.name) body.name = patch.name;
  if (patch.parentId) body.parentReference = { id: patch.parentId };
  return graphFetch<GraphItem>(
    itemUrl(id),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    "renameOrMove"
  );
}

/** Delete moves the item to the OneDrive recycle bin. */
export async function deleteById(id: string): Promise<void> {
  await graphFetch<void>(itemUrl(id), { method: "DELETE" }, "delete");
}

/**
 * Upload bytes into a folder. Small files go via a simple PUT; larger files use
 * a resumable upload session so a hiccup never corrupts a partial file.
 */
export async function uploadFile(
  parentId: string,
  name: string,
  bytes: Uint8Array,
  contentType: string
): Promise<GraphItem> {
  if (bytes.byteLength <= SMALL_UPLOAD_LIMIT) {
    return graphFetch<GraphItem>(
      itemUrl(parentId, `:/${encodeURIComponent(name)}:/content`),
      {
        method: "PUT",
        headers: { "content-type": contentType || "application/octet-stream" },
        // Copy to a fresh ArrayBuffer so the body type is portable across the
        // Bun (server) and DOM (eden type-import) lib typings.
        body: bytes.slice().buffer as ArrayBuffer,
      },
      "uploadSmall"
    );
  }
  return uploadLarge(parentId, name, bytes);
}

async function uploadLarge(
  parentId: string,
  name: string,
  bytes: Uint8Array
): Promise<GraphItem> {
  const session = await graphFetch<{ uploadUrl: string }>(
    itemUrl(parentId, `:/${encodeURIComponent(name)}:/createUploadSession`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "fail" },
      }),
    },
    "createUploadSession"
  );
  const total = bytes.byteLength;
  let offset = 0;
  let lastBody: GraphItem | null = null;
  while (offset < total) {
    const end = Math.min(offset + UPLOAD_CHUNK, total);
    const chunk = bytes.subarray(offset, end);
    // The upload URL is pre-authorised — no bearer token, talk to it directly.
    let res: Response;
    try {
      res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "content-length": String(chunk.byteLength),
          "content-range": `bytes ${offset}-${end - 1}/${total}`,
        },
        body: chunk.slice().buffer as ArrayBuffer,
      });
    } catch (error) {
      console.error("[onedrive] upload chunk network error:", error);
      throw Errors.upstream("Upload to OneDrive failed");
    }
    if (res.status === 200 || res.status === 201) {
      lastBody = (await res.json()) as GraphItem;
    } else if (res.status !== 202) {
      mapStatus(res.status, "uploadChunk");
    }
    offset = end;
  }
  if (!lastBody) throw Errors.upstream("Upload did not complete");
  return lastBody;
}

// --- Versions & sharing -----------------------------------------------------

export interface GraphVersion {
  id: string;
  size?: number;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
}

export async function listVersions(id: string): Promise<GraphVersion[]> {
  const res = await graphFetch<{ value: GraphVersion[] }>(
    itemUrl(id, "/versions"),
    {},
    "listVersions"
  );
  return res.value;
}

export async function restoreVersion(
  id: string,
  versionId: string
): Promise<void> {
  await graphFetch<void>(
    itemUrl(id, `/versions/${encodeURIComponent(versionId)}/restoreVersion`),
    { method: "POST" },
    "restoreVersion"
  );
}

export async function createShareLink(
  id: string,
  expirationDateTime?: string
): Promise<string> {
  const res = await graphFetch<{ link?: { webUrl?: string } }>(
    itemUrl(id, "/createLink"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "view",
        scope: "anonymous",
        ...(expirationDateTime ? { expirationDateTime } : {}),
      }),
    },
    "createLink"
  );
  const url = res.link?.webUrl;
  if (!url) throw Errors.upstream("OneDrive did not return a share link");
  return url;
}

// --- Change-notification subscriptions (for cache freshness) ----------------

export interface GraphSubscription {
  id: string;
  expirationDateTime: string;
  resource: string;
}

export async function createSubscription(
  notificationUrl: string,
  clientState: string,
  expirationDateTime: string
): Promise<GraphSubscription> {
  return graphFetch<GraphSubscription>(
    "/subscriptions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        changeType: "updated",
        notificationUrl,
        resource: `${driveBase().slice(1)}/root`,
        clientState,
        expirationDateTime,
      }),
    },
    "createSubscription"
  );
}

export async function renewSubscription(
  id: string,
  expirationDateTime: string
): Promise<GraphSubscription> {
  return graphFetch<GraphSubscription>(
    `/subscriptions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expirationDateTime }),
    },
    "renewSubscription"
  );
}

export { SMALL_UPLOAD_LIMIT };
