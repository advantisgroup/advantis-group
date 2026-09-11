"use client";

import { use } from "react";

import { notFound } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { ProjectForm } from "@/components/sales-cockpit/ProjectForm";

export default function EditSalesCockpitProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const t = useTranslations("SalesCockpit");
  const projects = useQuery(api.salesCockpit.listProjects);

  if (projects === undefined) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  const project = projects.find((p) => p._id === projectId);
  if (!project) notFound();

  return (
    <ProjectForm
      key={project._id}
      projectId={project._id}
      entitySavedAt={project.updatedAt ?? project.createdAt}
      initial={{
        titel: project.titel,
        start: project.start,
        einstiegssatz: project.einstiegssatz,
        benefits: project.benefits,
        ziele: project.ziele,
        sfInput: project.sfInput,
        flowId: project.flowId,
        files: project.files,
      }}
    />
  );
}
