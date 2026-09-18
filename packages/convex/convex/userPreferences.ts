// Moved to `people/preferences.ts`. Re-exported so the old `api.userPreferences.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { getMine, setMine, resetOnboarding } from "./people/preferences";
