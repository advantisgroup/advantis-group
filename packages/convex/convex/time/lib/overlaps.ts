import { type Doc, type Id } from "../../_generated/dataModel";
import { type QueryCtx } from "../../_generated/server";
import { displayName } from "./store";

export type Overlap = {
  absenceId: Id<"timeAbsences">;
  userId: Id<"users">;
  name: string;
  type: Doc<"timeAbsences">["type"];
  status: "pending" | "approved";
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  /** Shares at least one team with the person asking. */
  sameTeam: boolean;
  /** Leads a team (teams.reportsToUserId). */
  lead: boolean;
  teams: string[];
};

/**
 * Who else is away between `from` and `to` (inclusive), so a vacation request
 * can be weighed against it. Everyone sees others' vacation, requested or
 * approved — the same as the team calendar plus pending requests. Admins also
 * see every other absence type, sick days included, because they decide.
 */
export async function overlappingAbsences(
  ctx: QueryCtx,
  args: { subject: Id<"users">; from: string; to: string; adminView: boolean },
): Promise<Overlap[]> {
  const { subject, from, to, adminView } = args;
  const rows = (
    await ctx.db
      .query("timeAbsences")
      .withIndex("by_end", (q) => q.gte("endDate", from))
      .collect()
  ).filter(
    (row) =>
      row.startDate <= to &&
      row.userId !== subject &&
      (row.status === "approved" || row.status === "pending") &&
      (adminView || row.type === "vacation"),
  );
  if (rows.length === 0) return [];

  const teams = new Map(
    (await ctx.db.query("teams").collect())
      .filter((team) => !team.archivedAt)
      .map((team) => [team._id, team]),
  );
  const leads = new Set(
    [...teams.values()].map((team) => team.reportsToUserId).filter((id) => id !== undefined),
  );
  const teamsOf = async (userId: Id<"users">) =>
    (
      await ctx.db
        .query("userTeams")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    )
      .map((link) => link.teamId)
      .filter((teamId) => teams.has(teamId));
  const mine = new Set(await teamsOf(subject));
  // A team lead counts as part of the team they lead.
  for (const team of teams.values()) if (team.reportsToUserId === subject) mine.add(team._id);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const people = new Map(
    await Promise.all(
      userIds.map(async (userId) => {
        const [user, own] = await Promise.all([ctx.db.get(userId), teamsOf(userId)]);
        const all = new Set(own);
        for (const team of teams.values()) if (team.reportsToUserId === userId) all.add(team._id);
        return [userId, { user, teams: [...all] }] as const;
      }),
    ),
  );

  return rows
    .flatMap((row): Overlap[] => {
      const entry = people.get(row.userId);
      if (!entry?.user || entry.user.status === "removed") return [];
      return [
        {
          absenceId: row._id,
          userId: row.userId,
          name: displayName(entry.user),
          type: row.type,
          status: row.status as "pending" | "approved",
          startDate: row.startDate,
          endDate: row.endDate,
          halfDayStart: row.halfDayStart,
          halfDayEnd: row.halfDayEnd,
          sameTeam: entry.teams.some((teamId) => mine.has(teamId)),
          lead: leads.has(row.userId),
          teams: entry.teams.map((teamId) => teams.get(teamId)!.name).sort(),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.sameTeam) - Number(a.sameTeam) ||
        Number(b.lead) - Number(a.lead) ||
        a.startDate.localeCompare(b.startDate) ||
        a.name.localeCompare(b.name),
    );
}
