import { redirect } from "next/navigation";

/** Interaktionen is part of the Calls tab now (11/2026) — old links land there. */
export default async function EmployeeInteractionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/performance/mitarbeiter/${id}/calls`);
}
