"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

const NO_PROJECT_VALUE = "__none__";

function NewFlowDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("SalesCockpit");
  const router = useRouter();
  const handleError = useErrorHandler();
  const projects = useQuery(api.salesCockpit.projects.listProjects);
  const createFlow = useMutation(api.salesCockpit.flows.createFlow);

  const [titel, setTitel] = useState("");
  const [projectId, setProjectId] = useState<string>(NO_PROJECT_VALUE);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!titel.trim()) {
      toast.error(t("bitteTitel"));
      return;
    }
    setSaving(true);
    try {
      const res = await createFlow({
        titel: titel.trim(),
        projectId:
          projectId === NO_PROJECT_VALUE ? undefined : (projectId as Id<"salesCockpitProjects">),
      });
      onOpenChange(false);
      setTitel("");
      setProjectId(NO_PROJECT_VALUE);
      router.push(`/sales-cockpit/flows/${res.id}`);
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("neuerFlow")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("abbrechen")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {t("flowErstellen")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label className="mb-1.5 block">{t("titel")} *</Label>
          <Input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder={t("flowTitelPlaceholder")}
            autoFocus
          />
        </div>
        {projects && projects.length > 0 && (
          <div>
            <Label className="mb-1.5 block">{t("flowProjektOptional")}</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT_VALUE}>{t("flowKeinProjekt")}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.titel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

export default function SalesCockpitFlowsPage() {
  const t = useTranslations("SalesCockpit");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const flows = useQuery(api.salesCockpit.flows.listFlows);
  const removeFlow = useMutation(api.salesCockpit.flows.removeFlow);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleDelete(flow: NonNullable<typeof flows>[number]) {
    const ok = await confirm({
      title: t("flowLoeschenTitel"),
      description: t("flowLoeschenBeschreibung", { titel: flow.titel }),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeFlow({ flowId: flow._id });
      toast.success(t("flowGeloescht"));
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("flowsHint")}</p>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus />
          {t("neuerFlow")}
        </Button>
      </div>

      {flows === undefined ? (
        <SkeletonRows className="py-2" />
      ) : flows.length === 0 ? (
        <EmptyState icon={<Workflow />} title={t("keineFlows")} />
      ) : (
        <Card>
          <div className="divide-y divide-border/70">
            {flows.map((flow) => (
              <div
                key={flow._id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <Link
                  href={`/sales-cockpit/flows/${flow._id}`}
                  className="min-w-0 flex-1 text-left"
                >
                  <b className="block truncate text-sm hover:underline">{flow.titel}</b>
                  <p className="truncate text-xs text-muted-foreground">
                    {flow.projectTitel ? `${flow.projectTitel} · ` : ""}
                    {t("flowKnoten", { n: flow.nodeCount })}
                    {flow.updatedAt ? ` · ${formatDateTime(flow.updatedAt, "de-DE")}` : ""}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("delete")}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => void handleDelete(flow)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <NewFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
