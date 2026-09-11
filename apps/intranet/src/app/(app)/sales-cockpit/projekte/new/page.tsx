"use client";

import { blankProjectForm, ProjectForm } from "@/components/sales-cockpit/ProjectForm";

export default function NewSalesCockpitProjectPage() {
  return <ProjectForm projectId={null} initial={blankProjectForm()} />;
}
