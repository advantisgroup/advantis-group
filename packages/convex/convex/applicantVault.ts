// Moved to `hr/vault.ts`. Re-exported so the old `api.applicantVault.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  status,
  getPasswordRow,
  storePasswordHash,
  setPassword,
  recordUnlock,
  apiUnlockViaPasskey,
  unlock,
  checkLegacyPasswordSunset,
  lock,
  resetPassword,
  memberPasswordStatuses,
} from "./hr/vault";
