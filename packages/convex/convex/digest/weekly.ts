import { v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc } from "../_generated/dataModel";
import { internalAction, internalQuery } from "../functions";
import { userMatchesAudience } from "../lib/audience";
import { internalApiFetch } from "../lib/internalApi";
import { userCanReadWikiEntry } from "../wiki/entries";

const DAY = 24 * 60 * 60 * 1000;
const PER_SECTION = 6;

export interface DigestItem {
  title: string;
  path: string;
  /** Short context: a date, or who it's from. */
  detail?: string;
}

export interface Digest {
  userId: string;
  email: string;
  firstName: string | null;
  announcements: DigestItem[];
  updates: DigestItem[];
  wiki: DigestItem[];
  policies: DigestItem[];
  events: DigestItem[];
}

/** Internal employees get the digest unless they turned it off; external
 *  members only if they turned it on — same default as the Updates emails. */
export function wantsDigest(user: Doc<"users">, pref: boolean | undefined): boolean {
  return pref ?? !user.external;
}

function berlinDay(ms: number) {
  return new Date(ms).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * One digest per person who gets it, for the week ending `until`: what was
 * announced, posted and added to the wiki, policies still waiting for their
 * confirmation, and the events coming up in the next seven days — each
 * limited to what that person can see. People with nothing in any section
 * are left out, so nobody gets an empty email.
 */
export const build = internalQuery({
  args: { until: v.number() },
  handler: async (ctx, { until }): Promise<Digest[]> => {
    const since = until - 7 * DAY;
    const users = (await ctx.db.query("users").collect()).filter((u) => u.status === "active");
    const prefs = new Map(
      (await ctx.db.query("userPreferences").collect()).map((p) => [p.userId, p.weeklyDigest]),
    );
    const recipients = users.filter((u) => wantsDigest(u, prefs.get(u._id)));
    if (recipients.length === 0) return [];

    const announcements = (
      await ctx.db
        .query("announcements")
        .withIndex("by_publishedAt", (q) => q.gte("publishedAt", since).lte("publishedAt", until))
        .collect()
    ).filter((a) => !a.deletedAt);
    const updates = (
      await ctx.db
        .query("updates")
        .withIndex("by_publishedAt", (q) => q.gte("publishedAt", since).lte("publishedAt", until))
        .collect()
    ).filter((u) => !u.deletedAt);
    const wikiEntries = await ctx.db.query("wikiEntries").collect();
    const newWiki = wikiEntries.filter(
      (e) => e.createdAt >= since && e.createdAt <= until && !e.policy,
    );
    const policies = wikiEntries.filter((e) => e.policy);
    const events = (
      await ctx.db
        .query("events")
        .withIndex("by_start", (q) => q.gte("start", until).lte("start", until + 7 * DAY))
        .collect()
    ).filter((e) => !e.deletedAt && !e.dismissedAt && !e.personalForUserId);

    const digests: Digest[] = [];
    for (const user of recipients) {
      const reads = new Map(
        (
          await ctx.db
            .query("guidebookReads")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect()
        ).map((r) => [r.slug, r.version ?? 1]),
      );
      const digest: Digest = {
        userId: user._id,
        email: user.email,
        firstName: user.firstName ?? null,
        announcements: announcements
          .filter((a) => userMatchesAudience(user, a.audience))
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, PER_SECTION)
          .map((a) => ({ title: a.title, path: `/announcements?id=${a._id}` })),
        updates: updates
          .filter((u) => userMatchesAudience(user, u.audience))
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, PER_SECTION)
          .map((u) => ({ title: u.title, path: `/updates/${u._id}`, detail: u.summary })),
        wiki: newWiki
          .filter((e) => userCanReadWikiEntry(user, e))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, PER_SECTION)
          .map((e) => ({ title: e.thema, path: `/guidebooks/${encodeURIComponent(e.slug)}` })),
        policies: policies
          .filter(
            (e) =>
              userCanReadWikiEntry(user, e) && (reads.get(e.slug) ?? 0) < (e.policyVersion ?? 1),
          )
          .slice(0, PER_SECTION)
          .map((e) => ({ title: e.thema, path: `/guidebooks/${encodeURIComponent(e.slug)}` })),
        events: events
          .filter((e) => userMatchesAudience(user, e.audience))
          .sort((a, b) => a.start - b.start)
          .slice(0, PER_SECTION)
          .map((e) => ({
            title: e.title,
            path: `/calendar?event=${e._id}`,
            detail: berlinDay(e.start),
          })),
      };
      const total =
        digest.announcements.length +
        digest.updates.length +
        digest.wiki.length +
        digest.policies.length +
        digest.events.length;
      if (total > 0) digests.push(digest);
    }
    return digests;
  },
});

/** Monday morning: builds everyone's digest and hands them to the API,
 *  which owns Resend (same convention as the Updates emails). A no-op when
 *  the API isn't configured, e.g. in local dev. */
export const send = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number }> => {
    const digests: Digest[] = await ctx.runQuery(internal.digest.weekly.build, {
      until: Date.now(),
    });
    if (digests.length === 0) return { sent: 0 };
    const res = await internalApiFetch("/internal/digest/weekly", { digests });
    if (!res) {
      console.info("[weeklyDigest] skipped — API_URL/CONVEX_SERVER_KEY not set");
      return { sent: 0 };
    }
    if (!res.ok) {
      console.error(`[weeklyDigest] send failed: ${res.status} ${await res.text()}`);
      return { sent: 0 };
    }
    return { sent: digests.length };
  },
});
