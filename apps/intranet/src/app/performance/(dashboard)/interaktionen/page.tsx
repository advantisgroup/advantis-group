import { redirect } from "next/navigation";

/** Interaktionen is part of the Calls tab now (11/2026) — old links land there. */
export default function DashboardInteractionsPage() {
  redirect("/performance/calls");
}
