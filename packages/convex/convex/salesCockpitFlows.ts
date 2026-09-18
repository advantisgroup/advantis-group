// Moved to `salesCockpit/flows.ts`. Re-exported so the old `api.salesCockpitFlows.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  listFlows,
  getFlow,
  createFlow,
  renameFlow,
  removeFlow,
  upsertNode,
  moveNode,
  removeNode,
} from "./salesCockpit/flows";
