"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  ClipboardPlus,
  Ellipsis,
  Link2,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AskButton } from "@/components/ai/AskButton";
import { Link } from "@/components/Link";
import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  PropertyButton,
  SidePanel,
  SidePanelProperties,
  SidePanelSection,
  StatusChip,
} from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { copyPanelLink } from "@/hooks/use-panel-param";
import {
  CUSTOMER_FEEDBACKS,
  dateInputToMs,
  escalationLevel,
  msToDateInput,
  REPORT_STATUSES,
  responseAmpel,
  SEVERITIES,
  SEVERITY_ACCENT,
  STATUS_ACCENT,
  type ReportStatus,
  type Severity,
} from "@/lib/error-management";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Report = NonNullable<
  ReturnType<typeof useQuery<typeof api.fehlermanagement.reports.list>>
>[number];
export type Settings = NonNullable<
  ReturnType<typeof useQuery<typeof api.fehlermanagement.settings.get>>
>;
export type Scope = "offen" | "alle" | "geschlossen";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const STATUS_ICON = {
  neu: CircleDashed,
  in_bearbeitung: CircleDot,
  geschlossen: CircleCheck,
};

export function Dot({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        muted && "text-muted-foreground",
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function useDueLabel() {
  const t = useTranslations("ErrorManagement");
  return (report: Report, now: number) => {
    if (report.status === "geschlossen" || report.dueAt === null) return null;
    const days = Math.floor((report.dueAt - now) / DAY_MS);
    if (days < 0) return { text: t("overdueBy", { days: -days }), late: true };
    if (days === 0) return { text: t("dueToday"), late: false };
    return { text: t("dueIn", { days }), late: false };
  };
}

/** Customer-facing errors the customer hasn't heard about yet; green is the
 * expected state, so only amber and red are worth flagging. */
export function notInformed(report: Report, settings: Settings | undefined, now: number) {
  if (!settings || !report.customerOrProject || report.customerInformedAt) return null;
  if (report.status === "geschlossen") return null;
  const ampel = responseAmpel(Math.floor((now - report.createdAt) / DAY_MS), settings);
  return ampel === "gruen" ? null : ampel;
}
export function ErrorReportPanel({
  report,
  open,
  onOpenChange,
  settings,
}: {
  report: Report | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings | undefined;
}) {
  const tc = useTranslations("Common");
  // Holds the last report so the panel keeps its content while animating closed.
  const [shown, setShown] = useState(report);
  if (report && report !== shown) setShown(report);

  const accent = shown
    ? shown.status !== "geschlossen" && escalationLevel(shown) === 3
      ? "var(--destructive)"
      : STATUS_ACCENT[shown.status]
    : undefined;

  return (
    <SidePanel
      open={open && !!shown}
      onOpenChange={onOpenChange}
      title={shown?.description ?? ""}
      accent={accent}
      closeLabel={tc("close")}
      header={
        shown && <ErrorReportPanelHeader report={shown} onDeleted={() => onOpenChange(false)} />
      }
    >
      {shown && <ErrorReportPanelBody key={shown._id} report={shown} settings={settings} />}
    </SidePanel>
  );
}

export function ErrorReportPanelHeader({
  report,
  onDeleted,
}: {
  report: Report;
  onDeleted: () => void;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const update = useMutation(api.fehlermanagement.reports.update);
  const remove = useMutation(api.fehlermanagement.reports.remove);
  const measures = useQuery(api.fehlermanagement.measures.list, { errorReportId: report._id });
  const dueLabel = useDueLabel();

  const shortDate = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const due = dueLabel(report, Date.now());

  async function changeStatus(status: ReportStatus) {
    if (status === report.status) return;
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
    try {
      await update({ reportId: report._id, patch: { status } });
      toast.success(t("updated"));
    } catch (error) {
      handleError(error);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteErrorConfirm"),
      details: [
        { label: tc("fieldTitle"), value: report.description },
        ...(report.categoryName
          ? [{ label: tc("fieldCategory"), value: report.categoryName }]
          : []),
      ],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ reportId: report._id });
      toast.success(t("deleted"));
      onDeleted();
    } catch (error) {
      handleError(error);
    }
  }

  function copyLink() {
    void copyPanelLink("/fehlermanagement", report._id).then(() => toast.success(t("linkCopied")));
  }

  return (
    <div className="md:pr-9">
      <div className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{report.categoryName ?? t("fieldCategoryNone")}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{t("loggedOn", { date: shortDate(report.createdAt) })}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <AskButton
            look="icon"
            subject={{
              type: "errorReport",
              id: report._id,
              label: report.description.slice(0, 60),
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={t("moreActions")}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyLink}>
                <Link2 />
                {t("copyLink")}
              </DropdownMenuItem>
              {isManager && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void onDelete()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 />
                    {tc("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-lg font-semibold leading-snug tracking-tight text-balance">
        {report.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StatusChip
              accent={STATUS_ACCENT[report.status]}
              icon={STATUS_ICON[report.status]}
              label={t(`status.${report.status}`)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {REPORT_STATUSES.map((status) => (
              <DropdownMenuItem key={status} onClick={() => void changeStatus(status)}>
                <Dot color={STATUS_ACCENT[status]} label={t(`status.${status}`)} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          className={cn("text-xs", due?.late ? "font-medium text-warn" : "text-muted-foreground")}
        >
          {report.status === "geschlossen" && report.closedAt
            ? t("closedOn", { date: shortDate(report.closedAt) })
            : (due?.text ?? t("noDueDate"))}
        </span>
      </div>
    </div>
  );
}

export function ErrorReportPanelBody({
  report,
  settings,
}: {
  report: Report;
  settings: Settings | undefined;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const update = useMutation(api.fehlermanagement.reports.update);
  const categories = useQuery(api.fehlermanagement.categories.list) ?? [];
  const measures = useQuery(api.fehlermanagement.measures.list, { errorReportId: report._id });
  const level = escalationLevel(report);
  const ampel = notInformed(report, settings, Date.now());

  function patch(fields: Parameters<typeof update>[0]["patch"]) {
    update({ reportId: report._id, patch: fields }).catch(handleError);
  }

  const inputClass = "h-8 text-sm md:h-8";

  return (
    <>
      <SidePanelSection title={t("details")}>
        <SidePanelProperties
          rows={[
            {
              label: t("fieldSeverity"),
              value: (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PropertyButton>
                      <Dot
                        color={SEVERITY_ACCENT[report.severity]}
                        label={t(`severity.${report.severity}`)}
                      />
                    </PropertyButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {SEVERITIES.map((s: Severity) => (
                      <DropdownMenuItem key={s} onClick={() => patch({ severity: s })}>
                        <Dot color={SEVERITY_ACCENT[s]} label={t(`severity.${s}`)} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
            {
              label: t("fieldCategory"),
              value: (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PropertyButton>
                      <span className={cn(!report.categoryName && "text-muted-foreground")}>
                        {report.categoryName ?? t("fieldCategoryNone")}
                      </span>
                    </PropertyButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category._id}
                        onClick={() => patch({ categoryId: category._id as Id<"errorCategories"> })}
                      >
                        {category.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => patch({ categoryId: undefined })}>
                      {t("fieldCategoryNone")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
            {
              label: t("fieldDueAt"),
              value: (
                <Input
                  type="date"
                  className={cn(inputClass, "w-auto")}
                  defaultValue={msToDateInput(report.dueAt)}
                  onBlur={(event) => patch({ dueAt: dateInputToMs(event.target.value) })}
                />
              ),
            },
            {
              label: t("fieldResponsible"),
              value: (
                <Input
                  className={inputClass}
                  defaultValue={report.responsibleName ?? ""}
                  placeholder={t("fieldResponsiblePlaceholder")}
                  onBlur={(event) =>
                    event.target.value !== (report.responsibleName ?? "") &&
                    patch({ responsibleName: event.target.value })
                  }
                />
              ),
            },
            ...(report.status !== "geschlossen"
              ? [
                  {
                    label: t("columnEscalation"),
                    value: (
                      <span
                        className={cn(
                          "text-sm",
                          level === 3 && "font-medium text-destructive",
                          level === 2 && "font-medium text-warn",
                        )}
                      >
                        {t(`escalation.${level}`)}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SidePanelSection>

      <SidePanelSection title={t("fieldDescription")}>
        <Textarea
          defaultValue={report.description}
          className="min-h-20 text-sm"
          onBlur={(event) =>
            event.target.value.trim() &&
            event.target.value !== report.description &&
            patch({ description: event.target.value })
          }
        />
      </SidePanelSection>

      <SidePanelSection
        title={t("customerSection")}
        action={
          ampel && (
            <span
              className={cn(
                "text-[11px] font-medium",
                ampel === "rot" ? "text-destructive" : "text-warn",
              )}
            >
              {t("customerNotInformedBadge")}
            </span>
          )
        }
      >
        <SidePanelProperties
          rows={[
            {
              label: t("fieldCustomer"),
              value: (
                <Input
                  className={inputClass}
                  defaultValue={report.customerOrProject ?? ""}
                  placeholder={t("fieldCustomerPlaceholder")}
                  onBlur={(event) =>
                    event.target.value !== (report.customerOrProject ?? "") &&
                    patch({ customerOrProject: event.target.value })
                  }
                />
              ),
            },
            {
              label: t("fieldCustomerInformedAt"),
              value: (
                <Input
                  type="date"
                  className={cn(inputClass, "w-auto")}
                  defaultValue={msToDateInput(report.customerInformedAt)}
                  onBlur={(event) =>
                    patch({ customerInformedAt: dateInputToMs(event.target.value) })
                  }
                />
              ),
            },
            {
              label: t("fieldCustomerRespondedAt"),
              value: (
                <Input
                  type="date"
                  className={cn(inputClass, "w-auto")}
                  defaultValue={msToDateInput(report.customerRespondedAt)}
                  onBlur={(event) =>
                    patch({ customerRespondedAt: dateInputToMs(event.target.value) })
                  }
                />
              ),
            },
            {
              label: t("fieldCustomerFeedback"),
              value: (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PropertyButton>
                      <span className={cn(!report.customerFeedback && "text-muted-foreground")}>
                        {report.customerFeedback
                          ? t(`feedback.${report.customerFeedback}`)
                          : tc("none")}
                      </span>
                    </PropertyButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {CUSTOMER_FEEDBACKS.map((feedback) => (
                      <DropdownMenuItem
                        key={feedback}
                        onClick={() => patch({ customerFeedback: feedback })}
                      >
                        {t(`feedback.${feedback}`)}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => patch({ customerFeedback: undefined })}>
                      {tc("none")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
        />
      </SidePanelSection>

      <SidePanelSection title={t("preventionSection")}>
        <div className="space-y-3">
          <Textarea
            defaultValue={report.prevention ?? ""}
            placeholder={t("fieldPreventionPlaceholder")}
            className="min-h-20 text-sm"
            onBlur={(event) =>
              event.target.value !== (report.prevention ?? "") &&
              patch({ prevention: event.target.value })
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={report.effectivenessChecked}
              onCheckedChange={(value) => patch({ effectivenessChecked: value === true })}
            />
            {t("fieldEffectivenessChecked")}
          </label>
        </div>
      </SidePanelSection>

      <SidePanelSection
        title={t("tabMeasures")}
        action={
          <Button asChild variant="ghost" size="xs">
            <Link href={`/fehlermanagement/measures?error=${report._id}`}>
              <ClipboardPlus />
              {t("addMeasure")}
            </Link>
          </Button>
        }
      >
        {measures === undefined || measures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMeasures")}</p>
        ) : (
          <ul className="space-y-2">
            {measures.map((measure) => (
              <li key={measure._id} className="flex items-start gap-2.5 text-sm">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{
                    background:
                      measure.status === "erledigt" ? "var(--ok)" : "var(--muted-foreground)",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block",
                      measure.status === "erledigt" && "text-muted-foreground line-through",
                    )}
                  >
                    {measure.description}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`phase.${measure.phase}`)}
                    {measure.dueAt && ` · ${formatIsoDate(msToDateInput(measure.dueAt), locale)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SidePanelSection>
    </>
  );
}
