// Moved to `performance/topics.ts`. Re-exported so the old `api.performanceTopics.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { saveTopic, deleteTopic, setTopicStatus } from "./performance/topics";
