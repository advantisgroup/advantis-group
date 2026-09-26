import { ConvexError } from "convex/values";
import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { requireVaultUnlocked } from "../hr/lib/access";
import { userMatchesAudience } from "./audience";
import { type Caller } from "./caller";
import { navigateSearch } from "./navigateSearch";
import { visiblePages } from "./pages";
import { displayName } from "./users";

/**
 * What the model is given for Ask, the daily brief and find-your-way-around:
 * each record assembled under the asking person's own access, as plain text
 * plus the sources the panel shows. aiRuns.ts serves it; nothing here is a
 * Convex function.
 */

// --- Ask in place -----------------------------------------------------------

/** Nothing longer than this is handed to the model — a record with a huge
 * thread gets its oldest lines dropped rather than an unbounded prompt. */
const ASK_CONTEXT_CHARS = 12_000;

interface AskContext {
  title: string;
  href: string;
  /** The record as plain text, exactly as the model will see it. */
  text: string;
  /** The same thing described for a person: what the panel shows as chips. */
  sources: { label: string; href?: string }[];
}

async function userName(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  return userId ? displayName(await ctx.db.get(userId)) : null;
}

function block(title: string, lines: (string | null | undefined)[]) {
  const kept = lines.filter((line): line is string => !!line);
  return kept.length > 0 ? `## ${title}\n${kept.join("\n")}` : "";
}

async function ticketContext(ctx: QueryCtx, id: string): Promise<AskContext> {
  const ticketId = ctx.db.normalizeId("itTickets", id);
  const ticket = ticketId ? await ctx.db.get(ticketId) : null;
  if (!ticket || !ticketId) {
    throw new ConvexError({ code: "not_found", message: "Ticket not found" });
  }

  const history = await ctx.db
    .query("itTicketStatusHistory")
    .withIndex("by_ticket_and_changedAt", (q) => q.eq("ticketId", ticketId))
    .order("desc")
    .take(20);
  const thread = await ctx.db
    .query("itTicketThreads")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .first();
  const messages = thread
    ? (
        await ctx.db
          .query("itTicketMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(60)
      )
        .filter((m) => m.kind === "message" && !m.deletedAt)
        .reverse()
    : [];

  const href = `/it-tickets?open=${ticketId}`;
  const title = ticket.topic?.trim() || `#${ticket.nr}`;
  const text = [
    block("Ticket", [
      `Nummer: #${ticket.nr}`,
      `Status: ${ticket.status}`,
      `Kategorie: ${ticket.category}`,
      `Datum: ${ticket.date}`,
      `Angelegt von: ${ticket.createdByName}`,
      ticket.assignedToUserId
        ? `Zugewiesen an: ${await userName(ctx, ticket.assignedToUserId)}`
        : null,
      ticket.topic ? `Thema: ${ticket.topic}` : null,
      ticket.camId ? `CAM-ID: ${ticket.camId}` : null,
      ticket.custNo ? `Kundennummer: ${ticket.custNo}` : null,
      ticket.info ? `Info: ${ticket.info}` : null,
    ]),
    block(
      "Statusverlauf",
      await Promise.all(
        [...history].reverse().map(async (row) => {
          const when = new Date(row.changedAt).toISOString().slice(0, 10);
          const who = await userName(ctx, row.changedByUserId);
          return `${when}: ${row.previousStatus ?? "—"} → ${row.status} (${who})`;
        }),
      ),
    ),
    block(
      "Thread",
      await Promise.all(
        messages.map(async (m) => {
          const when = new Date(m.createdAt).toISOString().slice(0, 16).replace("T", " ");
          const who = m.kind === "message" ? await userName(ctx, m.senderUserId) : null;
          return m.kind === "message" ? `[${when}] ${who}: ${m.body}` : null;
        }),
      ),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title,
    href,
    text,
    sources: [
      { label: `IT-Ticket #${ticket.nr}`, href },
      ...(history.length > 0 ? [{ label: `Statusverlauf (${history.length})` }] : []),
      ...(messages.length > 0 ? [{ label: `Thread-Nachrichten (${messages.length})` }] : []),
    ],
  };
}

async function applicantContext(ctx: QueryCtx, caller: Caller, id: string): Promise<AskContext> {
  caller.require(caller.hasApplicantAccess);
  await requireVaultUnlocked(ctx, caller.id);

  const applicantId = ctx.db.normalizeId("applicants", id);
  const applicant = applicantId ? await ctx.db.get(applicantId) : null;
  if (!applicant) {
    throw new ConvexError({ code: "not_found", message: "Applicant not found" });
  }

  const href = `/hr/${applicantId}/uebersicht`;
  const text = [
    block("Bewerber", [
      `Name: ${applicant.name}`,
      applicant.position ? `Position: ${applicant.position}` : null,
      applicant.rating ? `Bewertung: ${applicant.rating}` : null,
      applicant.skills.length > 0 ? `Skills: ${applicant.skills.join(", ")}` : null,
    ]),
    block("Ausbildung", [applicant.ausbildung]),
    block("Berufserfahrung", [applicant.berufserfahrung]),
    block("Zusammenfassung", [applicant.zusammenfassung]),
    block("Interne Notizen", [applicant.notizen]),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title: applicant.name,
    href,
    text,
    sources: [
      { label: applicant.name, href },
      ...(applicant.ausbildung || applicant.berufserfahrung || applicant.zusammenfassung
        ? [{ label: "Lebenslauf-Angaben im Profil" }]
        : []),
      ...(applicant.notizen ? [{ label: "Interne Notizen" }] : []),
    ],
  };
}

function plainText(html: string) {
  return html
    .replace(/<(br|\/p|\/li|\/h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function announcementContext(ctx: QueryCtx, caller: Caller, id: string): Promise<AskContext> {
  const announcementId = ctx.db.normalizeId("announcements", id);
  const a = announcementId ? await ctx.db.get(announcementId) : null;
  const owner = a ? (a.ownerUserId ?? a.authorUserId) : null;
  const canSee =
    !!a &&
    (caller.owns(owner!) ||
      (userMatchesAudience(caller.user, a.audience) &&
        a.publishedAt <= Date.now() &&
        (!a.expiresAt || a.expiresAt > Date.now())));
  if (!a || !canSee) {
    throw new ConvexError({ code: "not_found", message: "Announcement not found" });
  }
  const href = `/announcements?id=${a._id}`;
  return {
    title: a.title,
    href,
    text: [
      block("Ankündigung", [
        `Titel: ${a.title}`,
        `Veröffentlicht: ${new Date(a.publishedAt).toISOString().slice(0, 10)}`,
        `Von: ${await userName(ctx, a.authorUserId)}`,
        a.category ? `Kategorie: ${a.category}` : null,
      ]),
      block("Text", [plainText(a.body)]),
    ]
      .filter(Boolean)
      .join("\n\n"),
    sources: [{ label: a.title, href }],
  };
}

async function errorReportContext(ctx: QueryCtx, id: string): Promise<AskContext> {
  const reportId = ctx.db.normalizeId("errorReports", id);
  const report = reportId ? await ctx.db.get(reportId) : null;
  if (!report || !reportId) {
    throw new ConvexError({ code: "not_found", message: "Error report not found" });
  }
  const measures = await ctx.db
    .query("errorMeasures")
    .withIndex("by_error", (q) => q.eq("errorReportId", reportId))
    .collect();
  const href = `/fehlermanagement?open=${reportId}`;
  const title = report.description.slice(0, 80);
  return {
    title,
    href,
    text: [
      block("Fehlermeldung", [
        `Beschreibung: ${report.description}`,
        report.categoryName ? `Kategorie: ${report.categoryName}` : null,
        `Schwere: ${report.severity}`,
        `Status: ${report.status}`,
        `Erfasst: ${new Date(report.createdAt).toISOString().slice(0, 10)}`,
        report.customerOrProject ? `Kunde/Projekt: ${report.customerOrProject}` : null,
        report.responsibleName ? `Verantwortlich: ${report.responsibleName}` : null,
        report.prevention ? `Vorbeugung: ${report.prevention}` : null,
        report.customerFeedback ? `Kundenfeedback: ${report.customerFeedback}` : null,
      ]),
      block(
        "Maßnahmen",
        measures.map(
          (m) =>
            `- [${m.status}] ${m.phase}: ${m.description}${m.dueAt ? ` (fällig ${new Date(m.dueAt).toISOString().slice(0, 10)})` : ""}`,
        ),
      ),
    ]
      .filter(Boolean)
      .join("\n\n"),
    sources: [
      { label: title, href },
      ...(measures.length > 0 ? [{ label: `Maßnahmen (${measures.length})` }] : []),
    ],
  };
}

async function suggestionContext(ctx: QueryCtx, id: string): Promise<AskContext> {
  const suggestionId = ctx.db.normalizeId("suggestions", id);
  const s = suggestionId ? await ctx.db.get(suggestionId) : null;
  if (!s || !suggestionId) {
    throw new ConvexError({ code: "not_found", message: "Suggestion not found" });
  }
  const category = await ctx.db.get(s.categoryId);
  const votes = await ctx.db
    .query("suggestionVotes")
    .withIndex("by_suggestion", (q) => q.eq("suggestionId", suggestionId))
    .collect();
  const href = `/suggestions?open=${suggestionId}`;
  return {
    title: s.title,
    href,
    text: block("Vorschlag", [
      `Titel: ${s.title}`,
      `Von: ${await userName(ctx, s.authorUserId)}`,
      category ? `Kategorie: ${category.name}` : null,
      `Status: ${s.status}`,
      s.outcome ? `Ergebnis: ${s.outcome}` : null,
      `Unterstützer: ${votes.length}`,
      s.explanation ? `Erklärung: ${s.explanation}` : null,
      s.decisionNote ? `Entscheidungsnotiz: ${s.decisionNote}` : null,
    ]),
    sources: [{ label: s.title, href }],
  };
}

/**
 * Everything the model is given about one record, assembled under the asking
 * person's own access — never from anything the browser sent. Contact details
 * are deliberately left out: a question about a record doesn't need someone's
 * address or date of birth to be answered.
 */
export async function askContext(
  ctx: QueryCtx,
  caller: Caller,
  type: "itTicket" | "applicant" | "announcement" | "errorReport" | "suggestion",
  id: string,
): Promise<AskContext> {
  const context =
    type === "itTicket"
      ? await ticketContext(ctx, id)
      : type === "applicant"
        ? await applicantContext(ctx, caller, id)
        : type === "announcement"
          ? await announcementContext(ctx, caller, id)
          : type === "errorReport"
            ? await errorReportContext(ctx, id)
            : await suggestionContext(ctx, id);
  return { ...context, text: context.text.slice(0, ASK_CONTEXT_CHARS) };
}

const BERLIN = "Europe/Berlin";
const DAY_MS = 86_400_000;

function berlinTime(ms: number) {
  return new Date(ms).toLocaleString("de-DE", {
    timeZone: BERLIN,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The same things the overview page already shows this person — their open
 * work, today's and tomorrow's events, what's waiting to be read — as one
 * plain block for the daily brief. Nothing here is beyond what they can
 * already see on the page.
 */
export async function dailyBriefContext(ctx: QueryCtx, caller: Caller) {
  const user = caller.user;
  const now = Date.now();
  const sources: { label: string; href?: string }[] = [];

  const assigned = (
    await ctx.db
      .query("itTickets")
      .withIndex("by_assignee", (q) => q.eq("assignedToUserId", user._id))
      .collect()
  ).filter((t) => t.status !== "closed");
  const mine = (
    await ctx.db
      .query("itTickets")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
      .collect()
  ).filter((t) => t.status !== "closed");
  if (assigned.length || mine.length) sources.push({ label: "IT-Tickets", href: "/it-tickets" });

  const measures = (
    await ctx.db
      .query("errorMeasures")
      .withIndex("by_status", (q) => q.eq("status", "offen"))
      .collect()
  ).filter((m) => m.ownerUserId === user._id);
  if (measures.length) {
    sources.push({ label: "Maßnahmen", href: "/fehlermanagement/measures" });
  }

  const events = (
    await ctx.db
      .query("events")
      .withIndex("by_start", (q) => q.lte("start", now + 2 * DAY_MS))
      .collect()
  )
    .filter(
      (e) =>
        !e.dismissedAt && e.end >= now - 12 * 3_600_000 && userMatchesAudience(user, e.audience),
    )
    .sort((a, b) => a.start - b.start)
    .slice(0, 12);
  if (events.length) sources.push({ label: "Kalender", href: "/calendar" });

  const announcements = (
    await ctx.db.query("announcements").withIndex("by_publishedAt").order("desc").take(50)
  ).filter(
    (a) =>
      a.publishedAt <= now &&
      (!a.expiresAt || a.expiresAt > now) &&
      (caller.owns(a.ownerUserId ?? a.authorUserId) || userMatchesAudience(user, a.audience)),
  );
  const openAnnouncements = (
    await Promise.all(
      announcements.map(async (a) => {
        const recent = now - a.publishedAt < 3 * DAY_MS;
        if (!recent && !a.pinned && !a.requiresAck) return null;
        const done = await ctx.db
          .query(a.requiresAck ? "announcementAcks" : "announcementReads")
          .withIndex("by_announcement_user", (q) =>
            q.eq("announcementId", a._id).eq("userId", user._id),
          )
          .first();
        return done ? null : a;
      }),
    )
  ).filter((a): a is Doc<"announcements"> => a !== null);
  if (openAnnouncements.length) sources.push({ label: "Ankündigungen", href: "/announcements" });

  const memberships = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const unreadChats = memberships.filter((m) => !m.leftAt && (m.unreadCount ?? 0) > 0);
  const unreadMessages = unreadChats.reduce((sum, m) => sum + (m.unreadCount ?? 0), 0);
  if (unreadChats.length) sources.push({ label: "Chats", href: "/chat" });

  const days = (ms: number) => Math.floor((now - ms) / DAY_MS);
  const text = [
    block("Person", [
      `Vorname: ${user.firstName ?? displayName(user)}`,
      `Jetzt: ${berlinTime(now)}`,
    ]),
    block(
      "IT-Tickets, die dir zugewiesen sind",
      assigned.map(
        (t) =>
          `- #${t.nr} ${t.topic?.trim() || t.category} (Status: ${t.status}, von ${t.createdByName}, seit ${days(t.createdAt)} Tagen)`,
      ),
    ),
    block(
      "Deine eigenen offenen IT-Tickets",
      mine.map((t) => `- #${t.nr} ${t.topic?.trim() || t.category} (Status: ${t.status})`),
    ),
    block(
      "Deine offenen Maßnahmen",
      measures.map(
        (m) =>
          `- ${m.description.slice(0, 200)}${m.dueAt ? ` (fällig ${berlinTime(m.dueAt)}${m.dueAt < now ? ", überfällig" : ""})` : ""}`,
      ),
    ),
    block(
      "Termine heute und morgen",
      events.map(
        (e) =>
          `- ${e.title}: ${e.allDay ? "ganztägig" : berlinTime(e.start)}${e.location ? `, ${e.location}` : ""}`,
      ),
    ),
    block(
      "Ungelesene oder zu bestätigende Ankündigungen",
      openAnnouncements
        .slice(0, 8)
        .map(
          (a) =>
            `- ${a.title}${a.requiresAck ? " (Bestätigung nötig)" : a.pinned ? " (angeheftet)" : ""}`,
        ),
    ),
    block("Chats", [
      unreadChats.length
        ? `${unreadMessages} ungelesene Nachrichten in ${unreadChats.length} Unterhaltungen`
        : null,
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { text: text.slice(0, ASK_CONTEXT_CHARS), sources };
}

/**
 * What the "find your way around" helper starts with: every page this person
 * can see (lib/pages.ts) with what each is for, plus their newest IT tickets.
 * Anything more specific — a wiki entry, a person, an event — it looks up
 * with its search tools (lib/navigateSearch.ts) rather than being handed.
 *
 * The model answers with a `key`, never a raw href; `hrefByKey` is how the API
 * route turns that back into a path, so a garbled reply can only fail closed.
 */
export async function navigateContext(ctx: QueryCtx, caller: Caller) {
  const pages = visiblePages(caller);
  const tickets = await navigateSearch(ctx, caller, "tickets", "");
  const recent = tickets.slice(0, 5);

  const hrefByKey: Record<string, string> = {};
  const pageLines: string[] = [];
  for (const page of pages) {
    hrefByKey[`page:${page.href}`] = page.href;
    pageLines.push(`- page:${page.href} — ${page.label}: ${page.description}`);
    for (const link of page.deepLinks ?? []) {
      hrefByKey[`page:${link.href}`] = link.href;
      pageLines.push(`  - page:${link.href} — ${link.label}`);
    }
  }
  for (const ticket of recent) hrefByKey[ticket.key] = ticket.href;

  const text = [
    block("Seiten (key — was man dort tut)", pageLines),
    block(
      "Deine neuesten IT-Tickets (key — Ticket)",
      recent.map((t) => `- ${t.key} — ${t.title} (${t.detail})`),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    text,
    hrefByKey,
    sources: [
      { label: `Seitenliste (${pages.length} Seiten, die du öffnen kannst)` },
      ...recent.map((t) => ({ label: `IT-Ticket ${t.title}`, href: t.href })),
    ],
  };
}
