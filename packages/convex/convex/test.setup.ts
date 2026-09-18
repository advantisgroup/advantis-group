/**
 * The module map `convexTest(schema, modules)` needs, picked the way Convex's
 * own bundler picks files: a name with more than one dot (every `*.test.ts`,
 * this file) isn't a Convex module. Rooted here so tests in any folder share it.
 */
export const modules = Object.fromEntries(
  Object.entries({
    ...import.meta.glob("./**/*.ts"),
    ...import.meta.glob("./**/*.js"),
  }).filter(([path]) => (path.split("/").pop()?.match(/\./g) ?? []).length === 1),
) as Record<string, () => Promise<unknown>>;
