// Moved to `security/totp.ts`. Re-exported so the old `api.totp.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  apiStatus,
  apiRegenerateRecoveryCodes,
  apiEnrollmentContext,
  apiBeginEnrollment,
  apiPendingSecret,
  apiFinishEnrollment,
  apiSecretForVerification,
  apiRecordVerification,
  apiVerifyRecoveryCode,
  apiRemove,
} from "./security/totp";
