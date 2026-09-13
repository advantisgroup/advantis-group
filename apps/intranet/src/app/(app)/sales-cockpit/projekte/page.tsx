"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { FolderKanban, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";

type Project = NonNullable<
  ReturnType<typeof useQuery<typeof api.salesCockpit.listProjects>>
>[number];

export default function SalesCockpitProjektePage() {
  const t = useTranslations("SalesCockpit");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const projects = useQuery(api.salesCockpit.listProjects);
  const removeProject = useMutation(api.salesCockpit.removeProject);

  const handleDelete = async (project: Project) => {
    const ok = await confirm({
      title: t("projektLoeschenTitel"),
      description: t("projektLoeschenBeschreibung", { titel: project.titel }),
      details: [{ label: tc("fieldTitle"), value: project.titel }],
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

  const fileCount = (p: Project) =>
    p.files.plan.length + p.files.scripte.length + p.files.dateien.length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/sales-cockpit/projekte/new">
            <Plus />
            {t("neuesProjekt")}
          </Link>
        </Button>
      </div>

      {projects === undefined ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title={t("keineProjekteAngelegt")}
          action={
            <Button asChild size="sm">
              <Link href="/sales-cockpit/projekte/new">
                <Plus />
                {t("neuesProjekt")}
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="divide-y divide-border/70">
            {projects.map((p) => (
              <div
                key={p._id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <b className="text-sm">{p.titel}</b>
                  <p className="text-xs text-muted-foreground">
                    {t("start")} {p.start || "–"} ·{" "}
                    {p.flow
                      ? t("flowZeile", { titel: p.flow.titel, n: p.flow.nodeCount })
                      : p.wege.length > 0
                        ? t("wegeLegacyZeile", { n: p.wege.length })
                        : t("flowKeinFlow")}{" "}
                    · {p.benefits.length} {t("tabBenefits")} · {fileCount(p)} {t("dateien")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/sales-cockpit/projekte/${p._id}`}>{t("bearbeiten")}</Link>
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
    </div>
  );
}
