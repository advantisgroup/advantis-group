// Moved to `org/offboarding.ts`. Re-exported so the old `api.offboarding.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { get, setLastWorkingDay, setStep } from "./org/offboarding";
