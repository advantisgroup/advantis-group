"use client";

import { useParams } from "next/navigation";

import { blankProjectForm, ProjectForm } from "@/components/sales-cockpit/ProjectForm";

export default function SalesCockpitProjectDraftPage() {
  const { draftId } = useParams<{ draftId: string }>();
  return (
    <ProjectForm key={draftId} projectId={null} draftId={draftId} initial={blankProjectForm()} />
  );
}
