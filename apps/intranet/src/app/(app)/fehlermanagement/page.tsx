"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ClipboardPlus, Plus, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
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
import {
  CUSTOMER_FEEDBACKS,
  dateInputToMs,
  ESCALATION_TINT,
  escalationLevel,
  isOverdue,
  msToDateInput,
  REPORT_STATUSES,
  type ReportStatus,
  responseAmpel,
  SEVERITIES,
  SEVERITY_TINT,
  type Severity,
  STATUS_TINT,
} from "@/lib/error-management";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Report = NonNullable<ReturnType<typeof useQuery<typeof api.errorReports.list>>>[number];
type Scope = "offen" | "alle" | "geschlossen";

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("ErrorManagement");
  const categories = useQuery(api.errorCategories.list) ?? [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("fieldCategoryNone")}</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c._id} value={c._id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NewErrorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const create = useMutation(api.errorReports.create);

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [severity, setSeverity] = useState<Severity>("niedrig");
  const [customer, setCustomer] = useState("");
  const [responsible, setResponsible] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setDescription("");
    setCategoryId("none");
    setSeverity("niedrig");
    setCustomer("");
    setResponsible("");
  }

  async function onSubmit() {
    if (!description.trim()) return;
    setBusy(true);
    try {
      await create({
        description,
        categoryId: categoryId === "none" ? undefined : (categoryId as Id<"errorCategories">),
        severity,
        customerOrProject: customer || undefined,
        responsibleName: responsible || undefined,
      });
      toast.success(t("created"));
      reset();
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
          <DialogTitle>{t("newErrorTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldDescription")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fieldDescriptionPlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCategory")}
              </label>
              <CategorySelect value={categoryId} onChange={setCategoryId} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldSeverity")}
              </label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`severity.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCustomer")}
              </label>
              <Input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder={t("fieldCustomerPlaceholder")}
              />
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
          <Button onClick={() => void onSubmit()} disabled={busy || !description.trim()}>
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorDetailDialog({
  report,
  onOpenChange,
}: {
  report: Report | null;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const update = useMutation(api.errorReports.update);
  const remove = useMutation(api.errorReports.remove);
  const measures = useQuery(
    api.errorMeasures.list,
    report ? { errorReportId: report._id } : "skip",
  );

  if (!report) return null;

  async function patch(fields: Parameters<typeof update>[0]["patch"]) {
    if (!report) return;
    try {
      await update({ reportId: report._id, patch: fields });
    } catch (e) {
      handleError(e);
    }
  }

  async function onDelete() {
    if (!report) return;
    const ok = await confirm({
      title: t("deleteErrorConfirm"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ reportId: report._id });
      toast.success(t("deleted"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    }
  }

  async function onStatusChange(status: ReportStatus) {
    if (
      status === "geschlossen" &&
      measures &&
      measures.length > 0 &&
      !measures.every((m) => m.effectivenessChecked)
    ) {
      const ok = await confirm({
        title: t("closeNeedsEffectivenessCheck"),
        confirmLabel: tc("confirm"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    await patch({ status });
    toast.success(t("updated"));
  }

  return (
    <Dialog open={!!report} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editErrorTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            defaultValue={report.description}
            onBlur={(e) =>
              e.target.value !== report.description && patch({ description: e.target.value })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldStatus")}
              </label>
              <Select
                value={report.status}
                onValueChange={(v) => void onStatusChange(v as ReportStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldSeverity")}
              </label>
              <Select
                value={report.severity}
                onValueChange={(v) => void patch({ severity: v as Severity })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`severity.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCategory")}
              </label>
              <CategorySelect
                value={report.categoryId ?? "none"}
                onChange={(v) =>
                  void patch({
                    categoryId: v === "none" ? undefined : (v as Id<"errorCategories">),
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldDueAt")}
              </label>
              <Input
                type="date"
                defaultValue={msToDateInput(report.dueAt)}
                onBlur={(e) => void patch({ dueAt: dateInputToMs(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCustomer")}
              </label>
              <Input
                defaultValue={report.customerOrProject ?? ""}
                onBlur={(e) => void patch({ customerOrProject: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldResponsible")}
              </label>
              <Input
                defaultValue={report.responsibleName ?? ""}
                onBlur={(e) => void patch({ responsibleName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCustomerInformedAt")}
              </label>
              <Input
                type="date"
                defaultValue={msToDateInput(report.customerInformedAt)}
                onBlur={(e) => void patch({ customerInformedAt: dateInputToMs(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCustomerRespondedAt")}
              </label>
              <Input
                type="date"
                defaultValue={msToDateInput(report.customerRespondedAt)}
                onBlur={(e) => void patch({ customerRespondedAt: dateInputToMs(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldCustomerFeedback")}
            </label>
            <Select
              value={report.customerFeedback ?? "none"}
              onValueChange={(v) =>
                void patch({
                  customerFeedback:
                    v === "none" ? undefined : (v as Report["customerFeedback"] & string),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tc("none")}</SelectItem>
                {CUSTOMER_FEEDBACKS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`feedback.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldPrevention")}
            </label>
            <Textarea
              defaultValue={report.prevention ?? ""}
              placeholder={t("fieldPreventionPlaceholder")}
              onBlur={(e) => void patch({ prevention: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={report.effectivenessChecked}
              onCheckedChange={(v) => void patch({ effectivenessChecked: v === true })}
            />
            {t("fieldEffectivenessChecked")}
          </label>

          <div className="rounded-lg border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("tabMeasures")}
              </p>
              <Link href={`/fehlermanagement/measures?error=${report._id}`}>
                <Button variant="outline" size="sm">
                  <ClipboardPlus className="mr-1.5 size-3.5" />
                  {t("addMeasure")}
                </Button>
              </Link>
            </div>
            {measures === undefined || measures.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noMeasures")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {measures.map((m) => (
                  <li key={m._id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.description}</span>
                    <Badge variant={m.status === "erledigt" ? "success" : "muted"}>
                      {t(`measureStatus.${m.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          {isManager && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {tc("delete")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Settings = NonNullable<ReturnType<typeof useQuery<typeof api.errorSettings.get>>>;

function ReportCard({
  report,
  settings,
  onOpen,
}: {
  report: Report;
  settings: Settings | undefined;
  onOpen: () => void;
}) {
  const t = useTranslations("ErrorManagement");
  const locale = useLocale();
  const level = escalationLevel({
    severity: report.severity,
    status: report.status,
    dueAt: report.dueAt,
  });
  const overdue = isOverdue({
    severity: report.severity,
    status: report.status,
    dueAt: report.dueAt,
  });
  // Only surfaced for customer-facing, still-open errors the customer hasn't
  // been informed about yet — green (within target) is the expected state
  // and not worth a badge, so only amber/red actually render.
  const ampel =
    settings &&
    report.customerOrProject &&
    !report.customerInformedAt &&
    report.status !== "geschlossen"
      ? responseAmpel(Math.floor((Date.now() - report.createdAt) / 86400000), settings)
      : null;

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onOpen}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 font-medium leading-snug">{report.description}</p>
          <Badge className={cn(ESCALATION_TINT[level])}>{t(`escalation.${level}`)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn(SEVERITY_TINT[report.severity])}>
            {t(`severity.${report.severity}`)}
          </Badge>
          <Badge variant="outline" className={cn(STATUS_TINT[report.status])}>
            {t(`status.${report.status}`)}
          </Badge>
          {report.categoryName && <Badge variant="muted">{report.categoryName}</Badge>}
          {overdue && <Badge variant="destructive">{t("overdueBadge")}</Badge>}
          {ampel && ampel !== "gruen" && (
            <Badge variant={ampel === "rot" ? "destructive" : "warning"}>
              {t("customerNotInformedBadge")}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {report.customerOrProject && <span>{report.customerOrProject}</span>}
          {report.responsibleName && <span>{report.responsibleName}</span>}
          {report.dueAt && <span>{formatIsoDate(msToDateInput(report.dueAt), locale)}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FehlermanagementPage() {
  const t = useTranslations("ErrorManagement");
  const reports = useQuery(api.errorReports.list);
  const settings = useQuery(api.errorSettings.get);
  const [scope, setScope] = useState<Scope>("offen");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);

  const filtered = useMemo(() => {
    if (!reports) return [];
    const query = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (scope === "offen" && r.status === "geschlossen") return false;
      if (scope === "geschlossen" && r.status !== "geschlossen") return false;
      if (
        query &&
        !`${r.description} ${r.customerOrProject ?? ""} ${r.categoryName ?? ""}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [reports, scope, search]);

  return (
    <div className="space-y-4" data-tour="tour-fehlermanagement-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          {t("newError")}
        </Button>
      </div>

      <div className="flex gap-1.5">
        {(["offen", "alle", "geschlossen"] as Scope[]).map((s) => (
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
            {t(s === "offen" ? "scopeOpen" : s === "alle" ? "scopeAll" : "scopeClosed")}
          </button>
        ))}
      </div>

      {reports === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle />}
          title={reports.length === 0 ? t("empty") : t("noResults")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((r) => (
            <ReportCard key={r._id} report={r} settings={settings} onOpen={() => setSelected(r)} />
          ))}
        </div>
      )}

      <NewErrorDialog open={newOpen} onOpenChange={setNewOpen} />
      <ErrorDetailDialog report={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
