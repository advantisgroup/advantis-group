"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { MEASURE_PHASES, type MeasurePhase, type MeasureStatus } from "@/lib/error-management";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Measure = NonNullable<ReturnType<typeof useQuery<typeof api.errorMeasures.list>>>[number];
type Scope = "offen" | "alle" | "erledigt";

const EMPTY_REPORTS: NonNullable<ReturnType<typeof useQuery<typeof api.errorReports.list>>> = [];

function msToDateInput(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

function NewMeasureDialog({
  open,
  onOpenChange,
  defaultErrorId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultErrorId: string | null;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const reports = useQuery(api.errorReports.list) ?? EMPTY_REPORTS;
  const create = useMutation(api.errorMeasures.create);

  const [errorId, setErrorId] = useState(defaultErrorId ?? "");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<MeasurePhase>("d3_sofort");
  const [responsible, setResponsible] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setErrorId(defaultErrorId ?? reports[0]?._id ?? "");
  }, [open, defaultErrorId, reports]);

  async function onSubmit() {
    if (!description.trim() || !errorId) return;
    setBusy(true);
    try {
      await create({
        errorReportId: errorId as Id<"errorReports">,
        description,
        phase,
        responsibleName: responsible || undefined,
      });
      toast.success(t("created"));
      setDescription("");
      setResponsible("");
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newMeasure")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldLinkedError")}
            </label>
            <Select value={errorId} onValueChange={setErrorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reports.map((r) => (
                  <SelectItem key={r._id} value={r._id}>
                    {r.description.slice(0, 60)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldMeasureDescription")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fieldMeasureDescriptionPlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldPhase")}
              </label>
              <Select value={phase} onValueChange={(v) => setPhase(v as MeasurePhase)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASURE_PHASES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`phase.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldResponsible")}
              </label>
              <Input
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder={t("fieldResponsiblePlaceholder")}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={busy || !description.trim() || !errorId}
          >
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MeasureCard({ measure, errorLabel }: { measure: Measure; errorLabel: string }) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const update = useMutation(api.errorMeasures.update);
  const remove = useMutation(api.errorMeasures.remove);

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteMeasureConfirm"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ measureId: measure._id });
      toast.success(t("deleted"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 font-medium leading-snug">{measure.description}</p>
          {isManager && (
            <button
              type="button"
              onClick={() => void onDelete()}
              aria-label={tc("delete")}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{errorLabel}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="muted">{t(`phase.${measure.phase}`)}</Badge>
          {measure.dueAt && (
            <Badge variant="outline">{formatIsoDate(msToDateInput(measure.dueAt), locale)}</Badge>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Select
            value={measure.status}
            onValueChange={(v) =>
              void update({ measureId: measure._id, patch: { status: v as MeasureStatus } })
            }
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="offen">{t("measureStatus.offen")}</SelectItem>
              <SelectItem value="erledigt">{t("measureStatus.erledigt")}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={measure.effectivenessChecked}
              onCheckedChange={(v) =>
                void update({ measureId: measure._id, patch: { effectivenessChecked: v === true } })
              }
            />
            {t("fieldEffectivenessChecked")}
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MeasuresPage() {
  const t = useTranslations("ErrorManagement");
  const measures = useQuery(api.errorMeasures.list, {});
  const reports = useQuery(api.errorReports.list) ?? EMPTY_REPORTS;
  const [scope, setScope] = useState<Scope>("offen");
  const [newOpen, setNewOpen] = useState(false);
  // Deep link from an error's detail dialog: /fehlermanagement/measures?error=<id>.
  const [errorFilter, setErrorFilter] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("error");
    if (id) {
      setErrorFilter(id);
      setNewOpen(true);
    }
  }, []);

  const reportById = useMemo(() => new Map(reports.map((r) => [r._id, r])), [reports]);

  const filtered = useMemo(() => {
    if (!measures) return [];
    return measures.filter((m) => {
      if (errorFilter && m.errorReportId !== errorFilter) return false;
      if (scope === "offen" && m.status !== "offen") return false;
      if (scope === "erledigt" && m.status !== "erledigt") return false;
      return true;
    });
  }, [measures, scope, errorFilter]);

  return (
    <div className="space-y-4" data-tour="tour-fehlermanagement-measures">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["offen", "alle", "erledigt"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                scope === s
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {t(
                s === "offen"
                  ? "measureScopeOpen"
                  : s === "alle"
                    ? "measureScopeAll"
                    : "measureScopeDone",
              )}
            </button>
          ))}
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          {t("newMeasure")}
        </Button>
      </div>

      {measures === undefined ? null : filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t("noMeasures")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((m) => (
            <MeasureCard
              key={m._id}
              measure={m}
              errorLabel={reportById.get(m.errorReportId)?.description ?? ""}
            />
          ))}
        </div>
      )}

      <NewMeasureDialog open={newOpen} onOpenChange={setNewOpen} defaultErrorId={errorFilter} />
    </div>
  );
}
