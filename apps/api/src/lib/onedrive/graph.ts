import { api } from "@advantis/convex/api";
import { type DriveQuota } from "@advantis/types";

import { getConvex, getConvexServerKey } from "../convex.js";
import { decrypt, encrypt } from "../crypto.js";
import { Errors } from "../errors.js";
import { optionalEnv, requireEnv } from "../env.js";
import { folderConfig, normalizePath } from "./access.js";

/**
 * Microsoft Graph (OneDrive) client. Because the drive belongs to a *personal*
 * Microsoft account, this uses the delegated OAuth flow: a one-time interactive
 * sign-in (see scripts/onedrive-auth.ts) yields a refresh token, which the API
 * exchanges for short-lived access tokens against the `consumers` endpoint.
 * Personal-account refresh tokens rotate on use, so the latest one is persisted
 * (encrypted) in Convex to survive redeploys. Every failure is funnelled through
 * `graphFetch` and mapped to our `ApiError` taxonomy — raw Graph error bodies
 * and secrets never reach the caller, only get logged server-side.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "Files.ReadWrite.All offline_access";
const authority = () => optionalEnv("ONEDRIVE_AUTHORITY") ?? "consumers";

/**
 * True only when OneDrive is wired up: the app credentials are present AND a
 * refresh token exists (env seed or the persisted one in Convex). Lets the UI
 * show a friendly "not set up yet" state instead of failing every call.
 */
export async function isConfigured(): Promise<boolean> {
  if (
    !optionalEnv("MS_GRAPH_CLIENT_ID") ||
    !optionalEnv("MS_GRAPH_CLIENT_SECRET")
  ) {
    return false;
  }
  if (optionalEnv("ONEDRIVE_REFRESH_TOKEN")) return true;
  try {
    const stored = await getConvex().query(api.onedrive.apiGetRefreshToken, {
      serverKey: getConvexServerKey(),
    });
    return Boolean(stored?.refreshToken);
  } catch {
    return false;
  }
}

const SMALL_UPLOAD_LIMIT = 4 * 1024 * 1024; // Graph's simple-PUT ceiling
const UPLOAD_CHUNK = 5 * 1024 * 1024; // multiple of 320 KiB, per Graph rules

// --- Auth (delegated refresh-token flow) ------------------------------------

let token: { accessToken: string; expiresAt: number } | null = null;
let currentRefresh: string | null = null; // decrypted refresh token, in-memory

/** Load the active refresh token: in-memory → persisted (Convex) → env seed. */
async function loadRefreshToken(): Promise<string> {
  if (currentRefresh) return currentRefresh;
  try {
    const stored = await getConvex().query(api.onedrive.apiGetRefreshToken, {
      serverKey: getConvexServerKey(),
    });
    if (stored?.refreshToken) {
      currentRefresh = decrypt(stored.refreshToken);
      return currentRefresh;
    }
  } catch (error) {
    console.error("[onedrive] could not read stored refresh token:", error);
  }
  const seed = optionalEnv("ONEDRIVE_REFRESH_TOKEN");
  if (!seed) {
    throw Errors.internal(
      "OneDrive is not authenticated — run the auth bootstrap to obtain a refresh token"
    );
  }
  currentRefresh = seed;
  return seed;
}

/** Persist a rotated refresh token (encrypted) so it survives redeploys. */
async function persistRefreshToken(next: string): Promise<void> {
  currentRefresh = next;
  try {
    await getConvex().mutation(api.onedrive.apiSetRefreshToken, {
      serverKey: getConvexServerKey(),
      refreshToken: encrypt(next),
    });
  } catch (error) {
    console.error("[onedrive] could not persist rotated refresh token:", error);
  }
}

async function getToken(force = false): Promise<string> {
  if (!force && token && Date.now() < token.expiresAt) return token.accessToken;
  const refreshToken = await loadRefreshToken();
  const body = new URLSearchParams({
    client_id: requireEnv("MS_GRAPH_CLIENT_ID"),
    client_secret: requireEnv("MS_GRAPH_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPE,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${authority()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) {
    console.error(`[onedrive] token refresh failed: ${res.status}`);
    throw Errors.upstream(
      "Could not authenticate with OneDrive — the refresh token may have expired; re-run the auth bootstrap"
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  token = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  // Personal-account refresh tokens rotate — persist the new one when it changes.
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    await persistRefreshToken(json.refresh_token);
  }
  return token.accessToken;
}

// --- Low-level fetch with error mapping + throttle handling -----------------

function mapStatus(status: number, context: string): never {
  if (status === 401 || status === 403) {
    throw Errors.forbidden("OneDrive denied the request");
  }
  if (status === 404) throw Errors.notFound("File or folder not found");
  if (status === 409)
    throw Errors.badRequest("A conflicting item already exists");
  if (status === 423) throw Errors.badRequest("The item is locked");
  if (status === 429)
    throw Errors.rateLimited("OneDrive is throttling requests");
  if (status >= 500)
    throw Errors.upstream("OneDrive is temporarily unavailable");
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
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
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

// The delegated token *is* the drive owner (chefsache@), so address /me/drive.
function driveBase(): string {
  return "/me/drive";
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
  let parent = item.parentReference?.path ?? "";
  // Listing/item calls return "/drive/root:/…", but search hits are addressed
  // via "/drives/{drive-id}/root:/…" instead — strip up to whichever "root:"
  // marker is present so both shapes resolve the same way.
  const marker = parent.indexOf("root:");
  if (marker !== -1) parent = parent.slice(marker + "root:".length);
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
  return graphFetch<GraphItem>(
    pathUrl(relPath, `?${SELECT}`),
    {},
    "getItemByPath"
  );
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
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
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
  // The search index doesn't reliably return a usable parentReference.path on
  // the hit itself — re-fetch by id for anything that fails to resolve, since
  // regular item lookups (already used by browsing) always include it.
  const resolved = await Promise.all(
    res.value.map(async hit => {
      if (relPathOf(hit) !== null) return hit;
      try {
        return await getItemById(hit.id);
      } catch {
        return hit;
      }
    })
  );
  return resolved.filter(item => relPathOf(item) !== null);
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

interface InvitePermission {
  id?: string;
}

interface GraphPermission {
  id: string;
  grantedToV2?: { user?: { email?: string } };
  grantedToIdentitiesV2?: { user?: { email?: string } }[];
}

/** Does this permission's granted identity match `email`? Personal OneDrive
 * accounts only populate `grantedToIdentitiesV2`; work/school accounts use
 * `grantedToV2` — check both. */
function permissionGrantedTo(perm: GraphPermission, email: string): boolean {
  const target = email.toLowerCase();
  if (perm.grantedToV2?.user?.email?.toLowerCase() === target) return true;
  return (
    perm.grantedToIdentitiesV2?.some(
      g => g.user?.email?.toLowerCase() === target
    ) ?? false
  );
}

/**
 * Directly share a drive item with a specific person (Graph's `/invite`,
 * distinct from the anonymous `/createLink` share below) — grants native
 * OneDrive access using their own identity rather than the intranet's
 * FileBrowser gateway. `requireSignIn: true` + `sendInvitation: false` grants
 * access silently without emailing an invite Graph itself; the intranet
 * decides if/how to tell the person.
 */
export async function inviteToItem(
  itemId: string,
  email: string,
  role: "read" | "write"
): Promise<{ permissionId: string }> {
  const res = await graphFetch<{ value: InvitePermission[] }>(
    itemUrl(itemId, "/invite"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipients: [{ email }],
        requireSignIn: true,
        sendInvitation: false,
        roles: [role],
      }),
    },
    "invite"
  );
  // Multiple recipients can partially fail with a 207 Multi-Status, which
  // `fetch`'s `res.ok` still treats as success (200-299) — so a granted
  // permission missing its `id` is worth checking explicitly rather than
  // handing an `undefined` id to the caller.
  const granted = res.value?.[0];
  if (granted?.id) return { permissionId: granted.id };

  // Personal/consumer OneDrive accounts don't echo the created permission's
  // id in the invite response itself (just a share link) — look it up via
  // the permissions list instead, matched by the invited email.
  const list = await graphFetch<{ value: GraphPermission[] }>(
    itemUrl(itemId, "/permissions"),
    {},
    "listPermissionsAfterInvite"
  );
  const match = list.value.find(p => permissionGrantedTo(p, email));
  if (!match?.id) {
    console.error(
      `[onedrive] invite to ${email} did not resolve to a permission id:`,
      JSON.stringify(res),
      JSON.stringify(list)
    );
    throw Errors.upstream(
      "OneDrive did not grant a usable permission for that person"
    );
  }
  return { permissionId: match.id };
}

/** Revoke a previously granted direct share. */
export async function removePermission(
  itemId: string,
  permissionId: string
): Promise<void> {
  await graphFetch<void>(
    itemUrl(itemId, `/permissions/${encodeURIComponent(permissionId)}`),
    { method: "DELETE" },
    "removePermission"
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
