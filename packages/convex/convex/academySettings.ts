// Moved to `academy/settings.ts`. Re-exported so the old `api.academySettings.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { checkPin, setPin, resetAll } from "./academy/settings";
