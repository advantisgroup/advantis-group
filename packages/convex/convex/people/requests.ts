import { userQuery } from "../functions";

/** Where a request stands, in the four words every kind maps onto — each
 *  area keeps its own vocabulary ("offen", "in_discussion", "denied"), which
 *  is fine inside that area but unreadable side by side. */
export type RequestState = "open" | "active" | "done" | "declined";

export interface MyRequest {
  kind: "ticket" | "suggestion" | "error" | "upload";
  id: string;
  title: string;
  state: RequestState;
  /** The area's own status value, for the badge's exact wording. */
  status: string;
  createdAt: number;
  updatedAt: number;
  href: string;
}

const PER_KIND = 50;

const TICKET_STATE: Record<string, RequestState> = {
  offen: "open",
  bearbeitung: "active",
  closed: "done",
};

const ERROR_STATE: Record<string, RequestState> = {
  neu: "open",
  in_bearbeitung: "active",
  geschlossen: "done",
};

const UPLOAD_STATE: Record<string, RequestState> = {
  pending: "open",
  uploading: "active",
  approved: "done",
  denied: "declined",
  failed: "declined",
  cancelled: "declined",
};

function suggestionState(status: string, outcome: string | undefined): RequestState {
  if (status === "open") return "open";
  if (status !== "closed") return "active";
  return outcome === "implemented" ? "done" : "declined";
}

function clip(text: string, max = 90) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Everything the signed-in person has asked for, across the areas that take
 * requests — IT tickets, suggestions, error reports and file uploads — newest
 * first, each with a link straight to it. Absence requests live in Clockodo
 * and are added by the page from the Clockodo API.
 */
export const mine = userQuery({
  args: {},
  handler: async (ctx): Promise<MyRequest[]> => {
    const me = ctx.caller.user._id;
    const [tickets, suggestions, errors, uploads] = await Promise.all([
      ctx.db
        .query("itTickets")
        .withIndex("by_creator", (q) => q.eq("createdByUserId", me))
        .order("desc")
        .take(PER_KIND),
      ctx.db
        .query("suggestions")
        .withIndex("by_author", (q) => q.eq("authorUserId", me))
        .order("desc")
        .take(PER_KIND),
      ctx.db
        .query("errorReports")
        .withIndex("by_creator", (q) => q.eq("createdByUserId", me))
        .order("desc")
        .take(PER_KIND),
      ctx.db
        .query("onedriveUploads")
        .withIndex("by_user", (q) => q.eq("requesterUserId", me))
        .order("desc")
        .take(PER_KIND),
    ]);

    const rows: MyRequest[] = [
      ...tickets
        .filter((t) => !t.deletedAt)
        .map((t) => ({
          kind: "ticket" as const,
          id: t._id,
          title: `#${t.nr} ${clip(t.topic?.trim() || t.info?.trim() || t.category)}`,
          state: TICKET_STATE[t.status] ?? "open",
          status: t.status,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt ?? t.createdAt,
          href: `/it-tickets?ticket=${t._id}`,
        })),
      ...suggestions
        .filter((s) => !s.deletedAt)
        .map((s) => ({
          kind: "suggestion" as const,
          id: s._id,
          title: clip(s.title),
          state: suggestionState(s.status, s.outcome),
          status: s.status === "closed" && s.outcome ? s.outcome : s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt ?? s.createdAt,
          href: `/suggestions?open=${s._id}`,
        })),
      ...errors
        .filter((e) => !e.deletedAt)
        .map((e) => ({
          kind: "error" as const,
          id: e._id,
          title: clip(e.description),
          state: ERROR_STATE[e.status] ?? "open",
          status: e.status,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt ?? e.closedAt ?? e.createdAt,
          href: `/fehlermanagement?open=${e._id}`,
        })),
      ...uploads.map((u) => ({
        kind: "upload" as const,
        id: u._id,
        title: u.fileName,
        state: UPLOAD_STATE[u.status] ?? "open",
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.reviewedAt ?? u.createdAt,
        href: "/files",
      })),
    ];
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
