"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  MANUAL_CONTACT_KINDS,
  ONBOARDING_STATUSES,
  type ManualContactKind,
} from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { Flag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

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

const NOBODY = "__none";
const KEEP = "__keep";

type Assignee = { userId: Id<"users">; name: string };

/** One case: stage, assignment, follow-up, the report's columns, the contact
 * log, and the form to log the next contact. */
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
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
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
      <div className="space-y-3 pt-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const kindLabel = (kind: string) =>
    ["reached", "not_reached", "email", "note", "status", "assign"].includes(kind)
      ? t(`contactKind.${kind as "note"}`)
      : kind;
  const statusLabel = (s: string | null) =>
    s && (ONBOARDING_STATUSES as readonly string[]).includes(s)
      ? t(`status.${s as "fresh"}`)
      : (s ?? "–");

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-1 pr-10 text-left">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
          {data.name}
          {data.prio && (
            <Badge variant="destructive" className="gap-1">
              <Flag className="h-3 w-3" />
              {t("prioBadge")}
            </Badge>
          )}
          {!data.inReport && <Badge variant="muted">{t("notInReportBadge")}</Badge>}
          {data.archived && <Badge variant="muted">{t("case.archivedBadge")}</Badge>}
        </SheetTitle>
        <SheetDescription className="tabular-nums">
          {t("case.number", { number: data.customerNumber })}
        </SheetDescription>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("case.status")}</Label>
          <Select value={data.status} onValueChange={(status) => void save({ status })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ONBOARDING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              onChange={(e) => void save({ nextFollowUp: e.target.value || null })}
            />
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

        <div className="flex items-center gap-3 sm:pt-6">
          <Switch
            id="ob-prio"
            checked={data.prio}
            onCheckedChange={(prio) => void save({ prio })}
          />
          <Label htmlFor="ob-prio">{t("case.prio")}</Label>
        </div>
      </section>

      <ContactForm caseId={caseId} currentStatus={data.status} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("case.log")}</h3>
        {data.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("case.logEmpty")}</p>
        ) : (
          <ol className="space-y-2">
            {data.contacts.map((c) => (
              <li key={c._id} className="rounded-lg border border-border/70 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{kindLabel(c.kind)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(c.at, locale)} · {c.byName}
                  </span>
                </div>
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

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("case.report")}</h3>
        <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t("case.reportStatus")}</dt>
          <dd>{data.reportStatus ?? "–"}</dd>
          <dt className="text-muted-foreground">{t("case.reportOwner")}</dt>
          <dd>{data.reportOwner ?? "–"}</dd>
          <dt className="text-muted-foreground">{t("case.reportDate")}</dt>
          <dd>{data.reportDate ? formatIsoDate(data.reportDate, locale) : "–"}</dd>
          {data.reportFields.map((f, i) => (
            <div key={i} className="contents">
              <dt className="truncate text-muted-foreground" title={f.label}>
                {f.label}
              </dt>
              <dd className="break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
        {data.reportFields.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("case.noReportFields")}</p>
        )}
      </section>
    </div>
  );
}

function ContactForm({
  caseId,
  currentStatus,
}: {
  caseId: Id<"onboardingCases">;
  currentStatus: string;
}) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const addContact = useMutation(api.performance.onboarding.addContact);
  const [kind, setKind] = useState<ManualContactKind>("reached");
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [status, setStatus] = useState(KEEP);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (kind === "note" && !note.trim()) {
      toast.error(t("case.noteRequired"));
      return;
    }
    setBusy(true);
    try {
      await addContact({
        caseId,
        kind,
        note: note.trim() || undefined,
        nextFollowUp: followUp || undefined,
        status: status === KEEP ? undefined : status,
      });
      setNote("");
      setFollowUp("");
      setStatus(KEEP);
      toast.success(t("case.saved"));
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
      <h3 className="text-sm font-semibold">{t("case.addTitle")}</h3>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("case.kind")}>
        {MANUAL_CONTACT_KINDS.map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? "default" : "outline"}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
          >
            {t(`contactKind.${k}`)}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ob-note">{t("case.note")}</Label>
        <Textarea
          id="ob-note"
          rows={3}
          value={note}
          placeholder={t("case.notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ob-next">{t("case.nextFollowUp")}</Label>
          <Input
            id="ob-next"
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("case.newStatus")}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>{t("case.keepStatus")}</SelectItem>
              {ONBOARDING_STATUSES.filter((s) => s !== currentStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={busy}>
          {t("case.save")}
        </Button>
      </div>
    </section>
  );
}
