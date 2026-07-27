import { redirect } from "next/navigation";

export default async function ApplicantIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/applicants/${id}/uebersicht`);
}
