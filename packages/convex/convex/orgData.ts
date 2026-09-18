// Moved to `org/structure.ts`. Re-exported so the old `api.orgData.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  listDepartments,
  createDepartment,
  renameDepartment,
  archiveDepartment,
  setDepartmentReportsTo,
  listTeams,
  createTeam,
  renameTeam,
  setTeamReportsTo,
  addUserToTeam,
  removeUserFromTeam,
  setUserDepartment,
  setTeamDepartment,
  archiveTeam,
} from "./org/structure";
