import { redirect } from "next/navigation";

/**
 * Canonicalized on /clockodo/admin, which embeds the same
 * ClockodoAdminPanel (see components/clockodo/ClockodoAdminPanel.tsx) — one
 * place to manage Clockodo, matching /clockodo being the primary surface
 * for both employees and managers. This route only exists so old links
 * keep working.
 */
export default function AdminIntegrationsClockodoPage() {
  redirect("/clockodo/admin");
}
