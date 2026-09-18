// Moved to `academy/questions.ts`. Re-exported so the old `api.academyQuestions.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { ask, listMine, listAll, answer, reopen } from "./academy/questions";
