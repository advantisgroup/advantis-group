// Moved to `security/passkeys.ts`. Re-exported so the old `api.passkeys.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  apiRegistrationContext,
  apiCreateChallenge,
  apiAuthenticationContext,
  apiRegistrationChallenge,
  apiCompleteRegistration,
  apiCompleteAuthentication,
  apiListForUser,
  apiRenameForUser,
  apiRemoveForUser,
  purgeExpiredChallenges,
} from "./security/passkeys";
