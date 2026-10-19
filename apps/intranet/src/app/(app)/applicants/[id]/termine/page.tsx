import { redirect } from "next/navigation";

/** The Akte has no calendar of its own: the shared one, this applicant outlined. */
export default async function ApplicantTerminePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/hr/termine?von=${id}`);
}
