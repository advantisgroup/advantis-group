import { userQuery } from "./functions";
import { visiblePages } from "./lib/pages";

/** The pages this person can open, for the ⌘K palette — the same list the
 * "find your way around" helper searches (lib/pages.ts). */
export const list = userQuery({
  args: {},
  handler: async (ctx) =>
    visiblePages(ctx.caller).map((page) => ({
      href: page.href,
      label: page.label,
      description: page.description,
      keywords: page.keywords ?? [],
      deepLinks: page.deepLinks ?? [],
    })),
});
