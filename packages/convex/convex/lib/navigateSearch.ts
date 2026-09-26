import { v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userMatchesAudience } from "./audience";
import { type Caller } from "./caller";
import { matchScore, pageHaystack, searchTerms, visiblePages } from "./pages";
import { displayName } from "./users";

/**
 * What the "find your way around" helper can look things up in, each limited
 * to what the asking person can already open themselves, each result carrying
 * the link that opens it. The model only ever sees what a search returned, and
 * the API only ever links to a key a search handed out — so an answer can only
 * point at something that was actually found.
 */
export const navigateSearchKind = v.union(
  v.literal("pages"),
  v.literal("tickets"),
  v.literal("wiki"),
  v.literal("people"),
  v.literal("announcements"),
  v.literal("suggestions"),
  v.literal("errorReports"),
  v.literal("events"),
);
export type NavigateSearchKind =
  | "pages"
  | "tickets"
  | "wiki"
  | "people"
  | "announcements"
  | "suggestions"
  | "errorReports"
  | "events";

export interface NavigateHit {
  /** What the model answers with. Stable for the same record. */
  key: string;
  title: string;
  /** A little context so two similar titles can be told apart. */
  detail?: string;
  href: string;
}

const LIMIT = 8;
const DAY_MS = 86_400_000;

function berlinDate(ms: number) {
  return new Date(ms).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ranked<T>(rows: T[], terms: string[], haystack: (row: T) => string) {
  return rows
    .map((row, i) => ({ row, score: matchScore(terms, haystack(row)), i }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, LIMIT)
    .map((m) => m.row);
}

export async function navigateSearch(
  ctx: QueryCtx,
  caller: Caller,
  kind: NavigateSearchKind,
  query: string,
): Promise<NavigateHit[]> {
  const user = caller.user;
  const terms = searchTerms(query);
  const now = Date.now();

  switch (kind) {
    case "pages": {
      const hits: NavigateHit[] = [];
      for (const page of ranked(visiblePages(caller), terms, pageHaystack)) {
        hits.push({
          key: `page:${page.href}`,
          title: page.label,
          detail: page.description,
          href: page.href,
        });
        for (const link of page.deepLinks ?? []) {
          hits.push({ key: `page:${link.href}`, title: link.label, href: link.href });
        }
      }
      return hits;
    }

    case "tickets": {
      // Your own and those assigned to you — the same tickets you can open.
      const mine = await ctx.db
        .query("itTickets")
        .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
        .order("desc")
        .take(100);
      const assigned = await ctx.db
        .query("itTickets")
        .withIndex("by_assignee", (q) => q.eq("assignedToUserId", user._id))
        .order("desc")
        .take(100);
      const byId = new Map([...mine, ...assigned].map((t) => [t._id, t]));
      const tickets = [...byId.values()].filter((t) => !t.deletedAt);
      // An empty search means "my tickets": the newest few.
      const rows = terms.length
        ? ranked(tickets, terms, (t) => `${t.nr} ${t.topic ?? ""} ${t.category} ${t.info ?? ""}`)
        : tickets.sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMIT);
      return rows.map((t) => ({
        key: `ticket:${t._id}`,
        title: `#${t.nr} ${t.topic?.trim() || t.category}`,
        detail: `${t.createdByUserId === user._id ? "von dir" : `von ${t.createdByName}`}, Status: ${t.status}, ${berlinDate(t.createdAt)}`,
        href: `/it-tickets?ticket=${t._id}`,
      }));
    }

    case "wiki": {
      const entries = (await ctx.db.query("wikiEntries").collect()).filter(
        (e) => !e.deletedAt && e.validUntil > now,
      );
      const guidebooks = (await ctx.db.query("guidebookPages").collect()).filter(
        (p) =>
          !p.deletedAt &&
          p.teams.length === 0 &&
          (!p.minRole || (p.minRole === "admin" ? caller.isAdmin : caller.isManager)),
      );
      return [
        ...ranked(
          entries,
          terms,
          (e) => `${e.thema} ${e.tags.join(" ")} ${e.categoryName ?? ""}`,
        ).map((e): NavigateHit => ({
          key: `wiki:${e._id}`,
          title: e.thema,
          detail: e.tags.length ? `Tags: ${e.tags.slice(0, 5).join(", ")}` : undefined,
          href: `/guidebooks/${e.slug}`,
        })),
        ...ranked(guidebooks, terms, (p) => `${p.title} ${p.description} ${p.topic}`).map(
          (p): NavigateHit => ({
            key: `guidebook:${p._id}`,
            title: p.title,
            detail: p.description.slice(0, 120),
            href: `/guidebooks/${p.slug}`,
          }),
        ),
      ].slice(0, LIMIT);
    }

    case "people": {
      const users = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
      return ranked(users, terms, (u) =>
        [
          u.firstName,
          u.lastName,
          u.email,
          u.jobTitle,
          u.department,
          ...(u.teams ?? []),
          ...(u.expertise ?? []),
        ]
          .filter(Boolean)
          .join(" "),
      ).map((u) => ({
        key: `person:${u._id}`,
        title: displayName(u),
        detail: [u.jobTitle, u.department].filter(Boolean).join(", ") || undefined,
        href: `/directory?user=${u._id}`,
      }));
    }

    case "announcements": {
      const rows = (
        await ctx.db.query("announcements").withIndex("by_publishedAt").order("desc").take(300)
      ).filter(
        (a: Doc<"announcements">) =>
          !a.deletedAt &&
          a.publishedAt <= now &&
          (caller.owns(a.ownerUserId ?? a.authorUserId) || userMatchesAudience(user, a.audience)),
      );
      return ranked(rows, terms, (a) => a.title).map((a) => ({
        key: `announcement:${a._id}`,
        title: a.title,
        detail: berlinDate(a.publishedAt),
        href: `/announcements?id=${a._id}`,
      }));
    }

    case "suggestions": {
      const rows = (
        await ctx.db.query("suggestions").withIndex("by_createdAt").order("desc").take(500)
      ).filter((s) => !s.deletedAt);
      return ranked(rows, terms, (s) => `${s.title} ${s.explanation ?? ""}`).map((s) => ({
        key: `suggestion:${s._id}`,
        title: s.title,
        detail: `Status: ${s.status}, ${berlinDate(s.createdAt)}`,
        href: `/suggestions?open=${s._id}`,
      }));
    }

    case "errorReports": {
      const rows = (await ctx.db.query("errorReports").collect()).filter((r) => !r.deletedAt);
      return ranked(
        rows.sort((a, b) => b.createdAt - a.createdAt),
        terms,
        (r) => `${r.description} ${r.categoryName ?? ""} ${r.customerOrProject ?? ""}`,
      ).map((r) => ({
        key: `errorReport:${r._id}`,
        title: r.description.slice(0, 100),
        detail: `Status: ${r.status}, ${berlinDate(r.createdAt)}`,
        href: `/fehlermanagement?open=${r._id}`,
      }));
    }

    case "events": {
      // Day-rounded, so the range doesn't move with every millisecond.
      const today = Math.floor(now / DAY_MS) * DAY_MS;
      const rows = (
        await ctx.db
          .query("events")
          .withIndex("by_start", (q) =>
            q.gte("start", today - 30 * DAY_MS).lte("start", today + 180 * DAY_MS),
          )
          .collect()
      ).filter((e) => !e.deletedAt && !e.dismissedAt && userMatchesAudience(user, e.audience));
      return ranked(
        rows,
        terms,
        (e) => `${e.title} ${e.description ?? ""} ${e.location ?? ""}`,
      ).map((e) => ({
        key: `event:${e._id}`,
        title: e.title,
        detail: `${berlinDate(e.start)}${e.location ? `, ${e.location}` : ""}`,
        href: `/calendar?event=${e._id}`,
      }));
    }
  }
}
