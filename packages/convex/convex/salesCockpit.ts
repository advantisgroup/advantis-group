// Moved to `salesCockpit/projects.ts` and `salesCockpit/lexikon.ts`. Re-exported so the old
// `api.salesCockpit.*` path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { listProjects, createProject, updateProject, removeProject } from "./salesCockpit/projects";
export { listLexikon, uploadLexikon, removeLexikon, searchLexikon } from "./salesCockpit/lexikon";
