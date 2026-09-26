// @vitest-environment node
/**
 * The page list is only useful if it's complete: this walks apps/intranet's
 * app directory and fails for any page that is neither listed nor explained
 * away, and for any listed href that doesn't lead to a real page.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { INTRANET_PAGES, matchScore, NOT_DESTINATIONS, searchTerms } from "./pages";

const APP_DIR = join(__dirname, "../../../../apps/intranet/src/app");

/** Every route with a page.tsx, route groups stripped. An optional
 * catch-all (`files/[[...path]]`) also serves the route without it. */
function appRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") routes.push(prefix || "/");
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    if (/^\[\[\.\.\..*\]\]$/.test(entry.name)) {
      if (readdirSync(child).includes("page.tsx")) routes.push(prefix || "/");
      continue;
    }
    const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
    routes.push(...appRoutes(child, prefix + segment));
  }
  return routes;
}

// The signed-in intranet must be listed in full; the separate areas beside it
// (Performance, the academy, sign-in and legal pages) only have to exist.
const routes = appRoutes(join(APP_DIR, "(app)"));
const allRoutes = appRoutes(APP_DIR);
const isStatic = (route: string) => !route.includes("[");
const asServed = (route: string) => route.replace(/^\/applicants(?=\/|$)/, "/hr");
const pathOf = (href: string) => href.split(/[?#]/)[0];

describe("intranet pages", () => {
  test("finds the app directory", () => {
    expect(routes).toContain("/it-tickets");
  });

  test("every static page is listed, or says why it isn't", () => {
    const listed = new Set(INTRANET_PAGES.map((page) => page.href));
    const missing = routes
      .filter(isStatic)
      .filter((route) => !(route in NOT_DESTINATIONS))
      .filter((route) => !listed.has(asServed(route)));
    expect(missing).toEqual([]);
  });

  test("every listed link leads to a real page", () => {
    const served = new Set(allRoutes.map(asServed));
    const hrefs = INTRANET_PAGES.flatMap((page) => [
      page.href,
      ...(page.deepLinks ?? []).map((link) => link.href),
    ]);
    expect(hrefs.filter((href) => !served.has(pathOf(href)))).toEqual([]);
  });

  test("nothing is excused that doesn't exist anymore", () => {
    const all = new Set(allRoutes);
    expect(Object.keys(NOT_DESTINATIONS).filter((route) => !all.has(route))).toEqual([]);
  });

  test("hrefs are unique", () => {
    const hrefs = INTRANET_PAGES.map((page) => page.href);
    expect(hrefs.length).toBe(new Set(hrefs).size);
  });
});

describe("page search", () => {
  test("matches across plurals, case and umlauts", () => {
    expect(matchScore(searchTerms("Wo beantrage ich Urlaub?"), "Abwesenheiten / Urlaub")).toBe(1);
    expect(matchScore(searchTerms("meine Tickets"), "IT-Ticket")).toBe(1);
    expect(matchScore(searchTerms("Maßnahmen"), "Massnahmen offen")).toBe(1);
  });

  test("short words don't match everything", () => {
    expect(matchScore(searchTerms("wie ist das"), "Wiki Istanbul Datenschutz")).toBe(0);
  });
});
