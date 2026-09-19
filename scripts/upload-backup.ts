/**
 * Used by .github/workflows/convex-backup.yml.
 *
 *   bun scripts/upload-backup.ts <encrypted-file>   upload, prune, record "ok"
 *   bun scripts/upload-backup.ts --failed           record a failed run
 *
 * Needs API_URL and CONVEX_SERVER_KEY. OneDrive credentials stay in apps/api:
 * it hands back an upload URL and the bytes go straight to Graph.
 */
import { basename } from "node:path";

const KEEP_DAYS = 90;
/** Graph wants chunks in multiples of 320 KiB; this is 32 of them. */
const CHUNK = 320 * 1024 * 32;

const apiUrl = process.env.API_URL?.replace(/\/$/, "");
const serverKey = process.env.CONVEX_SERVER_KEY;
if (!apiUrl || !serverKey) throw new Error("API_URL and CONVEX_SERVER_KEY must be set");

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}/internal/backups${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-convex-server-key": serverKey! },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const arg = process.argv[2];
if (!arg) throw new Error("Pass the encrypted backup file, or --failed");

if (arg === "--failed") {
  await api("/record", { status: "failed", note: process.env.RUN_URL });
  process.exit(0);
}

const file = Bun.file(arg);
const size = file.size;
const fileName = basename(arg);
const { uploadUrl } = await api<{ uploadUrl: string }>("/upload-session", { fileName });

for (let offset = 0; offset < size; offset += CHUNK) {
  const end = Math.min(offset + CHUNK, size);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-length": String(end - offset),
      "content-range": `bytes ${offset}-${end - 1}/${size}`,
    },
    body: await file.slice(offset, end).arrayBuffer(),
  });
  if (![200, 201, 202].includes(res.status)) {
    throw new Error(`chunk at ${offset} failed: ${res.status} ${await res.text()}`);
  }
  console.log(`uploaded ${Math.round((end / size) * 100)}%`);
}

const { deleted } = await api<{ deleted: number }>("/prune", { keepDays: KEEP_DAYS });
await api("/record", { status: "ok", fileName, sizeBytes: size });
console.log(`done: ${fileName} (${size} bytes), pruned ${deleted} older than ${KEEP_DAYS} days`);
