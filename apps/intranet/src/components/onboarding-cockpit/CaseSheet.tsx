"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { MILESTONES, suggestFollowUp } from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Flag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatIsoDate } from "@/lib/format";

import { CaseStatus } from "./CaseStatus";
import { ContactForm } from "./ContactForm";
import { CustomerNumber, TimeSelect, useStatusName } from "./shared";

const NOBODY = "__none";

type Assignee = { userId: Id<"users">; name: string };

/** One case: phase and milestones, situation of the last contact,
 * assignment, follow-up and note, the report's columns, the contact log and
 * the form for the next contact. */
export function CaseSheet({
  caseId,
  onOpenChange,
  assignees,
}: {
  caseId: Id<"onboardingCases"> | null;
  onOpenChange: (open: boolean) => void;
  assignees: Assignee[] | undefined;
}) {
  return (
    <Sheet open={!!caseId} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        {caseId && <CaseBody key={caseId} caseId={caseId} assignees={assignees} />}
      </SheetContent>
    </Sheet>
  );
}

function CaseBody({
  caseId,
  assignees,
}: {
  caseId: Id<"onboardingCases">;
  assignees: Assignee[] | undefined;
}) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const data = useQuery(api.performance.onboarding.get, { caseId });
  const statusName = useStatusName();
  const update = useMutation(api.performance.onboarding.update);

  const save = async (patch: Omit<Parameters<typeof update>[0], "caseId">) => {
    try {
      await update({ caseId, ...patch });
    } catch (e) {
      handleError(e, t("case.saveError"));
    }
  };

  if (data === undefined) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Status log lines store the stage name (since the status tree); older
  // ones the stage id, which `statusName` resolves too.
  const statusLabel = (s: string | null) => (s ? statusName(s) : "–");
  /** "2026-11-04 09:30" → "4. Nov. 2026, 09:30"; empty → "keine". */
  const followUpText = (v: string | null) => {
    if (!v) return t("case.noFollowUp");
    const [date, time] = v.split(" ");
    return `${formatIsoDate(date, locale)}${time ? `, ${time}` : ""}`;
  };
  const logTitle = (c: (typeof data.contacts)[number]) => {
    if (c.kind === "step" || c.kind === "milestone") {
      const key = c.fromValue ?? "";
      return t(c.toValue === "1" ? "case.stepOn" : "case.stepOff", {
        step: (MILESTONES as readonly string[]).includes(key) ? t(`steps.${key as "cards"}`) : key,
      });
    }
    if (c.kind === "outcome") {
      const via =
        c.fromValue === "email" ? t("situation.channel.email") : t("situation.channel.phone");
      return `${via} · ${c.toValue ?? ""}`;
    }
    return [
      "reached",
      "not_reached",
      "email",
      "note",
      "status",
      "step",
      "assign",
      "created",
      "followUp",
    ].includes(c.kind)
      ? t(`contactKind.${c.kind as "note"}`)
      : c.kind;
  };

  return (
    <>
      <div className="shrink-0 space-y-1 border-b bg-background px-6 pb-4 pr-14 pt-5 text-left border-border/70">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-lg tabular-nums">
          <span className="font-normal text-muted-foreground">{t("case.numberLabel")}</span>
          <CustomerNumber number={data.customerNumber} />
          {data.prio && (
            <Badge variant="destructive" className="gap-1">
              <Flag className="h-3 w-3" />
              {t("prioBadge")}
            </Badge>
          )}
          {data.manual && <Badge variant="muted">{t("case.manualBadge")}</Badge>}
          {data.archived && <Badge variant="muted">{t("case.archivedBadge")}</Badge>}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
          <span>
            {t("case.accountStatus")}: {data.accountStatus ?? "–"}
          </span>
          <span>
            {t("case.closeDate")}: {data.closeDate ? formatIsoDate(data.closeDate, locale) : "–"}
          </span>
        </SheetDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <CaseStatus data={data} />

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("case.assignee")}</Label>
            {data.canManage ? (
              <Select
                value={data.assigneeUserId ?? NOBODY}
                onValueChange={(v) =>
                  void save({ assigneeUserId: v === NOBODY ? null : (v as Id<"users">) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>{t("case.nobody")}</SelectItem>
                  {(assignees ?? []).map((a) => (
                    <SelectItem key={a.userId} value={a.userId}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="py-2 text-sm">{data.assigneeName ?? t("case.nobody")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ob-follow">{t("case.followUp")}</Label>
            <div className="flex gap-2">
              <Input
                id="ob-follow"
                type="date"
                value={data.nextFollowUp ?? ""}
                disabled={data.status === "done" || data.status === "winback"}
                onChange={(e) => void save({ nextFollowUp: e.target.value || null })}
              />
              <TimeSelect
                value={data.nextFollowUpTime ?? ""}
                disabled={data.status === "done" || !data.nextFollowUp}
                onChange={(time) => void save({ nextFollowUpTime: time || null })}
              />
              {!data.nextFollowUp && data.status !== "done" && data.status !== "winback" && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("case.suggestFollowUp")}
                  title={t("case.suggestFollowUp")}
                  onClick={() => {
                    const next = suggestFollowUp(new Date(), "contact");
                    void save({ nextFollowUp: next.date, nextFollowUpTime: next.time });
                  }}
                >
                  <CalendarPlus className="h-4 w-4" />
                </Button>
              )}
              {data.nextFollowUp && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("case.clearFollowUp")}
                  onClick={() => void save({ nextFollowUp: null })}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="ob-prio"
              checked={data.prio}
              onCheckedChange={(prio) => void save({ prio })}
            />
            <Label htmlFor="ob-prio">{t("case.prio")}</Label>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-standing-note">{t("case.noteTitle")}</Label>
            <Textarea
              id="ob-standing-note"
              key={`note-${data.note ?? ""}`}
              rows={2}
              defaultValue={data.note ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (data.note ?? "")) {
                  void save({ note: e.target.value });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">{t("case.noteHint")}</p>
          </div>
        </section>

        <ContactForm caseId={caseId} closed={data.status === "done" || data.status === "winback"} />

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("case.log")}</h3>
          {data.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("case.logEmpty")}</p>
          ) : (
            <ol className="space-y-2">
              {data.contacts.map((c) => (
                <li key={c._id} className="rounded-lg border border-border/70 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{logTitle(c)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(c.at, locale)} · {c.byName}
                    </span>
                  </div>
                  {c.kind === "followUp" && (
                    <p className="text-muted-foreground">
                      {t("case.change", {
                        from: followUpText(c.fromValue),
                        to: followUpText(c.toValue),
                      })}
                    </p>
                  )}
                  {(c.kind === "status" || c.kind === "assign") && (
                    <p className="text-muted-foreground">
                      {t("case.change", {
                        from:
                          c.kind === "status"
                            ? statusLabel(c.fromValue)
                            : (c.fromValue ?? t("case.nobody")),
                        to:
                          c.kind === "status"
                            ? statusLabel(c.toValue)
                            : (c.toValue ?? t("case.nobody")),
                      })}
                    </p>
                  )}
                  {c.note && <p className="mt-1 whitespace-pre-wrap">{c.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("case.report")}</h3>
          <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-border/70 p-4 text-sm sm:grid-cols-2">
            {[
              { label: t("case.accountStatus"), value: data.accountStatus },
              {
                label: t("case.closeDate"),
                value: data.closeDate ? formatIsoDate(data.closeDate, locale) : null,
              },
              { label: t("case.reportStatus"), value: data.reportStatus },
              { label: t("case.reportOwner"), value: data.reportOwner },
              {
                label: t("case.reportDate"),
                value: data.reportDate ? formatIsoDate(data.reportDate, locale) : null,
              },
              ...data.reportFields,
            ].map((f, i) => (
              <div key={i} className="min-w-0">
                <dt className="truncate text-xs text-muted-foreground" title={f.label}>
                  {f.label}
                </dt>
                <dd className="break-words">{f.value || "–"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
