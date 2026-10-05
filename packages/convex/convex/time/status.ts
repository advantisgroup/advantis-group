import { userQuery } from "../functions";
import { isTimeTestMode } from "./lib/mode";
import { openEntries } from "./lib/store";

/**
 * "Im Büro" for the directory: who is clocked in and not on a break right
 * now. Only the ids leave the server — no times — so it's fine for everyone.
 */
export const inOffice = userQuery({
  args: {},
  handler: async (ctx) => {
    // Test clock-ins must not show anyone as "Im Büro" before go-live.
    if (isTimeTestMode()) return [];
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
