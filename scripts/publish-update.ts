#!/usr/bin/env bun
/**
 * Publish (or re-publish) an Updates entry — incident, maintenance, or
 * changelog — from a markdown file with frontmatter. Same publish pipeline
 * as the "/updates/new" UI (banner, in-app notify, company-wide email),
 * just triggered from a file instead of a form. Re-running against the same
 * `slug` patches the existing row rather than creating a duplicate or
 * re-notifying everyone.
 *
 * Usage:
 *   bun run updates:publish content/updates/2026-07-uploads-speed.md
 *
 * Required env (same as apps/api / packages/convex):
 *   CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL), CONVEX_SERVER_KEY
 *
 * Frontmatter fields:
 *   type: incident | maintenance | changelog   (required)
 *   slug: unique-id-for-this-update            (required)
 *   title: Short, specific title                (required)
 *   summary: One or two sentences (~140 chars)   (required)
 *   author: someone@advantisgroup.de             (optional — defaults to the
 *                                                  first ADMIN_EMAILS entry)
 *   audience: all | department:Sales              (optional, default "all")
 *   affectedSystems: [Files/OneDrive, Chat]        (optional)
 *   status: investigating | scheduled | ...        (optional)
 *   startedAt: 2026-07-13T09:00:00Z                (optional ISO timestamp)
 *   publishAt: 2026-07-14T09:00:00Z                (optional, schedules)
 *   sendEmail: true                                 (optional, default true)
 *
 * Body: everything after the frontmatter, as markdown.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import { api } from "@advantis/convex/api";
import { ConvexHttpClient } from "convex/browser";
import matter from "gray-matter";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: bun run updates:publish <path/to/update.md>");
  process.exit(1);
}

const raw = readFileSync(resolve(process.cwd(), filePath), "utf-8");
const { data: fm, content } = matter(raw);

function requireField(name: string): string {
  const value = fm[name];
  if (typeof value !== "string" || !value.trim()) {
    console.error(`Missing required frontmatter field: ${name}`);
    process.exit(1);
  }
  return value.trim();
}

const type = requireField("type");
if (!["incident", "maintenance", "changelog"].includes(type)) {
  console.error(`Invalid type "${type}" — must be incident, maintenance, or changelog`);
  process.exit(1);
}
const slug = requireField("slug");
const title = requireField("title");
const summary = requireField("summary");

const authorEmail =
  (typeof fm.author === "string" && fm.author.trim()) ||
  (process.env.ADMIN_EMAILS ?? "").split(/[,;\s]+/).filter(Boolean)[0];
if (!authorEmail) {
  console.error(
    "No author — set `author: someone@advantisgroup.de` in the frontmatter, or ADMIN_EMAILS in the environment.",
  );
  process.exit(1);
}

function parseAudience(value: unknown) {
  if (typeof value !== "string" || value === "all") return { kind: "all" as const };
  if (value.startsWith("department:")) {
    return {
      kind: "department" as const,
      department: value.slice("department:".length),
    };
  }
  console.error(`Unrecognized audience "${value}" — use "all" or "department:Name"`);
  process.exit(1);
}

const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
const serverKey = process.env.CONVEX_SERVER_KEY;
if (!convexUrl || !serverKey) {
  console.error("CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) and CONVEX_SERVER_KEY must be set.");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

const result = await client.mutation(api.updates.publishFromMarkdown, {
  serverKey,
  authorEmail,
  slug,
  type: type as "incident" | "maintenance" | "changelog",
  title,
  summary,
  body: content.trim(),
  audience: parseAudience(fm.audience),
  affectedSystems: Array.isArray(fm.affectedSystems) ? fm.affectedSystems : undefined,
  status: typeof fm.status === "string" ? (fm.status as never) : undefined,
  startedAt: typeof fm.startedAt === "string" ? Date.parse(fm.startedAt) : undefined,
  publishAt: typeof fm.publishAt === "string" ? Date.parse(fm.publishAt) : undefined,
  emailRequested: fm.sendEmail !== false,
});

console.warn(
  result.updated
    ? `Updated existing update "${slug}" (id: ${result.id})`
    : `Published new update "${slug}" (id: ${result.id})`,
);
