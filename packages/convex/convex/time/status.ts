import { userQuery } from "../functions";
import { openEntries } from "./lib/store";

/**
 * "Im Büro" for the directory: who is clocked in and not on a break right
 * now. Only the ids leave the server — no times — so it's fine for everyone.
 */
export const inOffice = userQuery({
  args: {},
  handler: async (ctx) => {
    const open = await openEntries(ctx);
    const onBreak = new Set(open.filter((row) => row.kind === "break").map((row) => row.userId));
    return [
      ...new Set(
        open
          .filter((row) => row.kind === "work" && !onBreak.has(row.userId))
          .map((row) => row.userId),
      ),
    ];
  },
});
