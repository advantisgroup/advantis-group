// Moved to `security/secondaryEmails.ts`. Re-exported so the old `api.secondaryEmails.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { apiList, apiRequestCode, apiVerifyCode, apiRemove } from "./security/secondaryEmails";
