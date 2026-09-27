import { v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { userQuery } from "../functions";
import { userMatchesAudience } from "../lib/audience";
import { navigateSearch, type NavigateHit } from "../lib/navigateSearch";
import { matchScore, searchTerms } from "../lib/pages";
import { displayName } from "../lib/users";

const PER_GROUP = 5;
/** Chat is searched in the conversations you were most recently active in,
 *  a bounded number of messages each — enough to find what was said this
 *  week without one keystroke reading the whole message table. */
const CHAT_CONVERSATIONS = 15;
const CHAT_MESSAGES_EACH = 200;

function snippet(text: string, needle: string, radius = 50) {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(needle);
  if (at < 0) return flat.slice(0, radius * 2);
  const from = Math.max(0, at - radius);
  return `${from > 0 ? "…" : ""}${flat.slice(from, at + needle.length + radius)}${
    at + needle.length + radius < flat.length ? "…" : ""
  }`;
}

function ranked<T>(rows: T[], terms: string[], haystack: (row: T) => string): T[] {
  return rows
    .map((row, i) => ({ row, score: matchScore(terms, haystack(row)), i }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, PER_GROUP)
    .map((m) => m.row);
}

/**
 * ⌘K's search beyond pages, people and the wiki: tickets, events,
 * suggestions, error reports, status updates, the blog and your own chats —
 * each limited to what the searching person can open, each hit linked.
 */
export const everything = userQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const caller = ctx.caller;
    const trimmed = query.trim();
    const empty = {
      tickets: [] as NavigateHit[],
      events: [] as NavigateHit[],
      suggestions: [] as NavigateHit[],
      errorReports: [] as NavigateHit[],
      updates: [] as NavigateHit[],
      blog: [] as NavigateHit[],
      chat: [] as NavigateHit[],
    };
    if (trimmed.length < 3) return empty;
    const terms = searchTerms(trimmed);

    const [tickets, events, suggestions, errorReports] = await Promise.all(
      (["tickets", "events", "suggestions", "errorReports"] as const).map(async (kind) =>
        (await navigateSearch(ctx, caller, kind, trimmed)).slice(0, PER_GROUP),
      ),
    );

    const updateRows = (
      await ctx.db.query("updates").withIndex("by_publishedAt").order("desc").take(300)
    ).filter(
      (u) =>
        !u.deletedAt &&
        // A scheduled post stays hidden until it goes out, except to its author.
        (u.publishedAt <= Date.now() || u.authorUserId === caller.user._id) &&
        userMatchesAudience(caller.user, u.audience),
    );
    const updates = ranked(updateRows, terms, (u) => `${u.title} ${u.summary}`).map((u) => ({
      key: `update:${u._id}`,
      title: u.title,
      detail: u.summary,
      href: `/updates/${u._id}`,
    }));

    const blog = caller.can("manage_blog")
      ? ranked(
          (await ctx.db.query("blogPosts").order("desc").take(300)).filter((p) => !p.deletedAt),
          terms,
          (p) => `${p.title} ${p.excerpt}`,
        ).map((p) => ({
          key: `blog:${p._id}`,
          title: p.title,
          detail: p.excerpt,
          href: `/blog/${p._id}`,
        }))
      : [];

    const needle = trimmed.toLowerCase();
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", caller.user._id))
      .collect();
    const conversations = (
      await Promise.all(
        memberships.filter((m) => !m.leftAt).map((m) => ctx.db.get(m.conversationId)),
      )
    )
      .filter((c): c is Doc<"conversations"> => !!c && !c.deletedAt)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, CHAT_CONVERSATIONS);
    const chatHits: { message: Doc<"messages">; conversation: Doc<"conversations"> }[] = [];
    for (const conversation of conversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .order("desc")
        .take(CHAT_MESSAGES_EACH);
      for (const message of messages) {
        if (!message.deletedAt && message.body.toLowerCase().includes(needle)) {
          chatHits.push({ message, conversation });
        }
      }
    }
    const chat = await Promise.all(
      chatHits
        .sort((a, b) => b.message.createdAt - a.message.createdAt)
        .slice(0, PER_GROUP)
        .map(async ({ message, conversation }) => {
          const sender = await ctx.db.get(message.senderUserId);
          return {
            key: `message:${message._id}`,
            title: snippet(message.body, needle),
            detail: [conversation.name, sender ? displayName(sender) : null]
              .filter(Boolean)
              .join(" · "),
            href: `/chat?c=${conversation._id}`,
          };
        }),
    );

    return { tickets, events, suggestions, errorReports, updates, blog, chat };
  },
});
