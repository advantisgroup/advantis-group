"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  activeChildren,
  findStage,
  isClosedStatus,
  nextStatus,
  type OutcomeTop,
} from "@advantis/convex/performance/onboarding";
import { useMutation } from "convex/react";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StatusBadge, useOutcomeLabel, useStatusConfig, useStatusName } from "./shared";

type Node = {
  id: string;
  label: string;
  freetext?: boolean;
  archived?: boolean;
  kind?: OutcomeTop["kind"];
  children?: Node[];
};

interface CaseStatusData {
  _id: Id<"onboardingCases">;
  status: string;
  outcomePath: string[];
  outcomeText: string | null;
  outcomeAt: number | null;
  outcomeByName: string | null;
  milestones: string[];
}

/**
 * Stage, milestone ("Zwischenstatus") and outcome of a case. The outcome is
 * picked step by step through the status tree: result → reason →
 * sub-reason, plus free text where asked. "successful" moves the case to the
 * next stage, "will cancel" closes it onto the winback list.
 */
export function CaseStatus({ data }: { data: CaseStatusData }) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const config = useStatusConfig();
  const statusName = useStatusName();
  const outcomeLabel = useOutcomeLabel();
  const update = useMutation(api.performance.onboarding.update);
  const setOutcome = useMutation(api.performance.onboarding.setOutcome);

  const stage = findStage(config, data.status);
  const closed = isClosedStatus(data.status);
  const [path, setPath] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [busy, setBusy] = useState(false);

  // The picker's levels: options of the stage, then children of each pick.
  const levels: Node[][] = [];
  let options: Node[] = (stage?.options ?? []).filter((o) => !o.archived) as Node[];
  const chosen: Node[] = [];
  for (let i = 0; i <= path.length && options.length > 0; i++) {
    levels.push(options);
    const node = options.find((o) => o.id === path[i]);
    if (!node) break;
    chosen.push(node);
    options = activeChildren(node) as Node[];
  }
  const last = chosen[chosen.length - 1];
  const complete = !!last && activeChildren(last).length === 0;
  const kind = chosen[0]?.kind ?? "other";
  const needsText = complete && !!last.freetext;
  const askFollowUp = complete && (kind === "followUp" || kind === "notReached" || kind === "case");

  const pick = (level: number, id: string) => {
    setPath([...path.slice(0, level), id]);
  };

  const submit = async () => {
    if (!complete) return;
    if (needsText && !text.trim()) {
      toast.error(t("statusTree.textRequired"));
      return;
    }
    setBusy(true);
    try {
      const result = await setOutcome({
        caseId: data._id,
        path,
        text: text.trim() || undefined,
        nextFollowUp: askFollowUp && followUp ? followUp : undefined,
        nextFollowUpTime: askFollowUp && followUp ? followUpTime || null : undefined,
      });
      toast.success(
        result.status !== data.status
          ? t("statusTree.movedTo", { status: statusName(result.status) })
          : t("statusTree.saved"),
      );
      setPath([]);
      setText("");
      setFollowUp("");
      setFollowUpTime("");
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const current = outcomeLabel(data);

  return (
    <section className="space-y-4 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("statusTree.title")}</h3>
        <Select
          value={data.status}
          onValueChange={(status) =>
            void update({ caseId: data._id, status }).catch((e) =>
              handleError(e, t("case.saveError")),
            )
          }
        >
          <SelectTrigger className="h-8 w-[220px]" aria-label={t("statusTree.stage")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {config.stages
              .filter((s) => !s.archived || s.id === data.status)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            <SelectItem value="done">{t("status.done")}</SelectItem>
            <SelectItem value="winback">{t("status.winback")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stage path: where the case stands */}
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {config.stages
          .filter((s) => !s.archived)
          .map((s, i, list) => {
            const index = list.findIndex((x) => x.id === data.status);
            const past = data.status === "done" || (index >= 0 && i < index);
            const here = s.id === data.status;
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    here && "border-foreground/40 bg-foreground text-background",
                    past && "border-ok/30 bg-ok/10 text-ok",
                    !here && !past && "border-border/70 text-muted-foreground",
                  )}
                >
                  {s.label}
                  {s.milestone && data.milestones.includes(s.id) && " ✓"}
                </span>
                {i < list.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </li>
            );
          })}
        {closed && (
          <>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <StatusBadge status={data.status} />
          </>
        )}
      </ol>

      {stage?.milestone && (
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm hover:bg-muted/40">
          <Checkbox
            checked={data.milestones.includes(stage.id)}
            onCheckedChange={(v) =>
              void update({ caseId: data._id, milestone: { done: v === true } }).catch((e) =>
                handleError(e, t("case.saveError")),
              )
            }
          />
          <span>
            <span className="font-medium">{stage.milestone}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {t("statusTree.milestone")}
            </span>
          </span>
        </label>
      )}

      <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t("statusTree.current")}: </span>
        {current ? (
          <>
            <span className="font-medium">{current}</span>
            {data.outcomeText && (
              <span className="block whitespace-pre-wrap">{data.outcomeText}</span>
            )}
            {data.outcomeAt && (
              <span className="block text-xs text-muted-foreground">
                {formatDateTime(data.outcomeAt, locale)} · {data.outcomeByName}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{t("statusTree.none")}</span>
        )}
      </div>

      {!closed && stage && levels.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("statusTree.set")}</p>
          <div className="flex flex-wrap gap-1.5">
            {levels[0].map((o) => (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={path[0] === o.id ? "default" : "outline"}
                className={cn(
                  "h-8",
                  path[0] !== o.id && o.kind === "success" && "border-ok/40 text-ok",
                  path[0] !== o.id &&
                    o.kind === "cancel" &&
                    "border-destructive/40 text-destructive",
                )}
                onClick={() => pick(0, o.id)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          {levels.slice(1).map((level, i) => (
            <div key={i + 1} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {i === 0 ? t("statusTree.reason") : t("statusTree.detail")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {level.map((o) => (
                  <Button
                    key={o.id}
                    type="button"
                    size="sm"
                    variant={path[i + 1] === o.id ? "default" : "outline"}
                    className="h-8"
                    onClick={() => pick(i + 1, o.id)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          {needsText && (
            <div className="space-y-1.5">
              <Label htmlFor="ob-outcome-text">{t("statusTree.freetext")}</Label>
              <Input id="ob-outcome-text" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}

          {askFollowUp && (
            <div className="space-y-1.5">
              <Label htmlFor="ob-outcome-follow">{t("case.nextFollowUp")}</Label>
              <div className="flex gap-2">
                <Input
                  id="ob-outcome-follow"
                  type="date"
                  className="w-[170px]"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
                <Input
                  type="time"
                  aria-label={t("case.followUpTime")}
                  className="w-[110px]"
                  value={followUpTime}
                  disabled={!followUp}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {complete && kind === "success" && (
            <p className="text-xs text-ok">
              {t("statusTree.willMove", { status: statusName(nextStatus(config, data.status)) })}
            </p>
          )}
          {complete && kind === "cancel" && (
            <p className="text-xs text-destructive">{t("statusTree.willWinback")}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {path.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPath([])}>
                {t("statusTree.clear")}
              </Button>
            )}
            <Button size="sm" disabled={!complete || busy} onClick={() => void submit()}>
              {t("statusTree.save")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
