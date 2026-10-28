"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { type CaseRow, useStatusConfig } from "./shared";

export const NO_OUTCOME = "__none";

/**
 * The status tree on the dashboard: one column per stage (plus done and
 * winback) with how many cases sit there and how they split by outcome.
 * Clicking a stage or an outcome filters the list below.
 */
export function StageOverview({
  cases,
  stage,
  outcome,
  onPick,
}: {
  cases: CaseRow[];
  stage: string | null;
  outcome: string | null;
  onPick: (stage: string | null, outcome: string | null) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const config = useStatusConfig();
  const stages = config.stages.filter((s) => !s.archived || cases.some((c) => c.status === s.id));
  const done = cases.filter((c) => c.status === "done").length;
  const winback = cases.filter((c) => c.status === "winback").length;

  const toggle = (s: string, o: string | null) =>
    stage === s && outcome === o ? onPick(null, null) : onPick(s, o);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{t("overview.title")}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {stages.map((s) => {
          const inStage = cases.filter((c) => c.status === s.id);
          const counts = new Map<string, number>();
          let none = 0;
          for (const c of inStage) {
            const top = c.outcomePath[0];
            if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
            else none++;
          }
          const milestone = s.milestone
            ? inStage.filter((c) => c.milestones.includes(s.id)).length
            : null;
          const options = s.options.filter((o) => !o.archived || counts.has(o.id));
          return (
            <div
              key={s.id}
              className={cn(
                "flex flex-col rounded-xl border border-border/70 bg-card",
                stage === s.id && "border-foreground/40",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(s.id, null)}
                className={cn(
                  "flex items-baseline justify-between gap-2 rounded-t-xl border-b border-border/70 px-3 py-2 text-left hover:bg-muted/50",
                  stage === s.id && outcome === null && "bg-muted/60",
                )}
              >
                <span className="text-sm font-medium">{s.label}</span>
                <span className="text-xl font-semibold tabular-nums">{inStage.length}</span>
              </button>
              {milestone !== null && (
                <p className="border-b border-border/70 px-3 py-1.5 text-xs text-muted-foreground">
                  {s.milestone}: <span className="tabular-nums">{milestone}</span> /{" "}
                  <span className="tabular-nums">{inStage.length}</span>
                </p>
              )}
              <ul className="flex-1 py-1 text-xs">
                {options.length > 0 && (
                  <Line
                    label={t("overview.noOutcome")}
                    count={none}
                    active={stage === s.id && outcome === NO_OUTCOME}
                    onClick={() => toggle(s.id, NO_OUTCOME)}
                    muted
                  />
                )}
                {options.map((o) => (
                  <Line
                    key={o.id}
                    label={o.label}
                    count={counts.get(o.id) ?? 0}
                    tone={o.kind}
                    active={stage === s.id && outcome === o.id}
                    onClick={() => toggle(s.id, o.id)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
        <div className="flex flex-col gap-2">
          <ClosedTile
            label={t("status.done")}
            count={done}
            active={stage === "done"}
            onClick={() => toggle("done", null)}
          />
          <ClosedTile
            label={t("status.winback")}
            count={winback}
            tone="destructive"
            active={stage === "winback"}
            onClick={() => toggle("winback", null)}
          />
        </div>
      </div>
    </section>
  );
}

function Line({
  label,
  count,
  active,
  onClick,
  tone,
  muted,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: string;
  muted?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={count === 0}
        className={cn(
          "flex w-full items-baseline justify-between gap-2 px-3 py-1 text-left hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent",
          active && "bg-muted/60 font-medium",
          count === 0 && "text-muted-foreground/60",
          muted && count > 0 && "text-muted-foreground",
          count > 0 && tone === "success" && "text-ok",
          count > 0 && tone === "cancel" && "text-destructive",
        )}
      >
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{count}</span>
      </button>
    </li>
  );
}

function ClosedTile({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-baseline justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-left hover:bg-muted/50",
        active && "border-foreground/40 bg-muted/60",
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "destructive" && count > 0 && "text-destructive",
          !tone && count > 0 && "text-ok",
        )}
      >
        {count}
      </span>
    </button>
  );
}
