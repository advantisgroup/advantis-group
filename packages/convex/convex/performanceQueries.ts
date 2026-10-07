// Moved to `performance/queries.ts`. Re-exported so the old `api.performanceQueries.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  cacheCompletedMonthBadges,
  teamDashboard,
  teamDevelopment,
  employeeDetail,
  interactionsMonth,
  interactionsDayDetail,
  drilldown,
} from "./performance/queries";
