import { redirect } from "next/navigation";

/** Reports folded into Planner's "Summary" view — see Planner in ../page.tsx. */
export default function ClockodoReportsPage() {
  redirect("/clockodo/planner");
}
