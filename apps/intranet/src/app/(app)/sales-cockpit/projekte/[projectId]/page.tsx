"use client";

import { use, useRef } from "react";

import { notFound } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { SkeletonRows } from "@/components/ui/skeleton";
import { Link } from "@/components/Link";
import { ProjectForm } from "@/components/sales-cockpit/ProjectForm";

export default function EditSalesCockpitProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const t = useTranslations("SalesCockpit");
  const projects = useQuery(api.salesCockpit.projects.listProjects);
  // Whether this project was ever here — if it vanishes after that, someone
  // deleted it mid-edit, which deserves a sentence rather than a 404.
  const seen = useRef(false);

  if (projects === undefined) {
    return <SkeletonRows className="py-2" />;
  }
  const project = projects.find((p) => p._id === projectId);
  if (project) seen.current = true;

  if (!project) {
    if (!seen.current) notFound();
    return (
      <div className="space-y-4">
        <Link
          href="/sales-cockpit/projekte"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("tabProjekte")}
        </Link>
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("projektZwischenzeitlichGeloescht")}
        </p>
      </div>
    );
  }

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
