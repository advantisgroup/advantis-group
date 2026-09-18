// Moved to `fehlermanagement/measures.ts`. Re-exported so the old `api.errorMeasures.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  list,
  effectiveness,
  listMineOpen,
  create,
  update,
  remove,
  addDocument,
  listDocuments,
  removeDocument,
} from "./fehlermanagement/measures";
