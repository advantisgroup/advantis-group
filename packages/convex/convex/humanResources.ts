// Moved to `hr/employees.ts`. Re-exported so the old `api.humanResources.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  setOnboarding,
  archiveProfile,
  convertApplicant,
  revertConversion,
  archiveApplicant,
  addDocument,
  listDocuments,
  removeDocument,
  employeeFolderName,
  apiEmployeeFolderName,
} from "./hr/employees";
