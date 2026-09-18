// Moved to `integrations/onedrive.ts`. Re-exported so the old `api.onedrive.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  apiUserContext,
  apiGenerateStagingUrl,
  apiSubmitRequest,
  apiRecordDirectUpload,
  apiGetUpload,
  apiMarkUploading,
  apiMarkApproved,
  apiMarkDenied,
  apiMarkFailed,
  apiRecordAction,
  apiGetRefreshToken,
  apiSetRefreshToken,
  apiUploadersByItemIds,
  apiTeamAccessRoster,
  apiSetTeamAccess,
  apiClearTeamAccess,
  listPending,
  myUploads,
  auditFeed,
  cancelRequest,
  renewSubscription,
} from "./integrations/onedrive";
