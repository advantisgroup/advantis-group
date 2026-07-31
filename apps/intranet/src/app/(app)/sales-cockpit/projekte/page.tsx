"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FolderKanban, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { blankProjectForm, ProjectForm, type ProjectFormValue } from "@/components/sales-cockpit/ProjectForm";
import { useErrorHandler } from "@/hooks/use-error-handler";

type Project = NonNullable<ReturnType<typeof useQuery<typeof api.salesCockpit.listProjects>>>[number];

function toFormValue(p: Project): ProjectFormValue {
  return {
    titel: p.titel,
    start: p.start,
    einstiegssatz: p.einstiegssatz,
    benefits: p.benefits,
    ziele: p.ziele,
    sfInput: p.sfInput,
    wege: p.wege.map((w) => ({ name: w.name, einwaende: w.einwaende, benefit: w.benefit, ziele: w.ziele })),
    files: p.files,
  };
}

export default function SalesCockpitProjektePage() {
  const t = useTranslations("SalesCockpit");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const projects = useQuery(api.salesCockpit.listProjects);
  const removeProject = useMutation(api.salesCockpit.removeProject);

  const [editing, setEditing] = useState<{ id: Id<"salesCockpitProjects"> | null; value: ProjectFormValue } | null>(
    null,
  );

  const handleDelete = async (project: Project) => {
    const ok = await confirm({
      title: t("projektLoeschenTitel"),
      description: t("projektLoeschenBeschreibung", { titel: project.titel }),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeProject({ projectId: project._id });
      toast.success(t("projektGeloescht"));
    } catch (error) {
      handleError(error);
    }
  };

  const fileCount = (p: Project) => p.files.plan.length + p.files.scripte.length + p.files.dateien.length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ id: null, value: blankProjectForm() })}>
          <Plus />
          {t("neuesProjekt")}
        </Button>
      </div>

      {projects === undefined ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : projects.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title={t("keineProjekteAngelegt")} />
      ) : (
        <Card>
          <div className="divide-y divide-border/70">
            {projects.map((p) => (
              <div key={p._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <b className="text-sm">{p.titel}</b>
                  <p className="text-xs text-muted-foreground">
                    {t("start")} {p.start || "–"} · {p.wege.length} {t("wege")} · {p.benefits.length}{" "}
                    {t("tabBenefits")} · {fileCount(p)} {t("dateien")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing({ id: p._id, value: toFormValue(p) })}>
                    {t("bearbeiten")}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void handleDelete(p)}>
                    {t("loeschen")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("projektBearbeiten") : t("neuesProjektAnlegen")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProjectForm
              key={editing.id ?? "new"}
              projectId={editing.id}
              initial={editing.value}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
