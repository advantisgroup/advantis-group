// Moved to `security/passwordResets.ts`. Re-exported so the old `api.passwordResets.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  recordAudit,
  requestReset,
  myHrRequestState,
  listRequests,
  requestHistory,
  pendingCount,
  listLinkedEmails,
  addLinkedEmail,
  removeLinkedEmail,
  dismissRequest,
  revokeIssuedLink,
  prepareIssue,
  storeIssuedToken,
  issueResetLink,
  prepareAutoIssue,
  autoIssueLinkedReset,
  tokenByHash,
  checkToken,
  applyReset,
  completeReset,
  purgeStale,
} from "./security/passwordResets";
