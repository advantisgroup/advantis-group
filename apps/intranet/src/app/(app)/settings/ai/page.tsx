"use client";

import { type ReactNode } from "react";

import { Check, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { cn } from "@/lib/utils";

/** The AI features that can start a run, in the order someone meets them. */
const FEATURES = [
  "wikiChat",
  "wikiFormat",
  "wikiMeta",
  "coachReport",
  "coachEod",
  "coachWikiExtract",
  "cvExtract",
  "cvRescan",
  "ask",
] as const;

/** Label/explanation pairs — the shape this whole page is made of. Not
 * `SettingsRow`: nothing here is a control, and a row would put a label and a
 * paragraph at opposite ends of a wide card with nothing in between. */
function Facts({ rows }: { rows: { term: string; detail: ReactNode }[] }) {
  return (
    <dl className="mt-4 border-t border-border/60">
      {rows.map((row) => (
        <div
          key={row.term}
          className="grid gap-x-8 gap-y-1 border-b border-border/60 py-3.5 sm:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <dt className="text-[13.5px] font-medium">{row.term}</dt>
          <dd className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {row.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">{hint}</p>
      {children}
    </section>
  );
}

/**
 * What the AI can see, in plain words.
 *
 * Every line here is something the code actually does — where a feature sends
 * text, what is kept, for how long, and who else can see it. An assistant
 * inside an intranet holding absences and HR documents only gets used if
 * that's answerable without asking an engineer. Laid out as reference rather
 * than as settings: there is nothing on this page to switch.
 */
export default function SettingsAiPage() {
  const t = useTranslations("Ai");
  const canUseAi = useHasCapability("use_ai");

  return (
    <div className="max-w-3xl space-y-9">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          canUseAi ? "border-border/70 bg-card" : "border-warning/40 bg-warning/5",
        )}
      >
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
            canUseAi ? "bg-success/12 text-success" : "bg-warning/15 text-warning",
          )}
        >
          {canUseAi ? <Check className="size-4" /> : <Lock className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">
            {canUseAi ? t("privacy.accessOn") : t("privacy.accessOff")}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {canUseAi ? t("privacy.accessOnBody") : t("privacy.accessOffBody")}
          </p>
        </div>
      </div>

      <Group title={t("privacy.featuresTitle")} hint={t("privacy.featuresHint")}>
        <Facts
          rows={FEATURES.map((feature) => ({
            term: t(`kind.${feature}`),
            detail: t(`privacy.feature.${feature}`),
          }))}
        />
      </Group>

      <Group title={t("privacy.whereTitle")} hint={t("privacy.whereHint")}>
        <Facts
          rows={[
            { term: t("privacy.provider"), detail: t("privacy.providerBody") },
            { term: t("privacy.storage"), detail: t("privacy.storageBody") },
            { term: t("privacy.retention"), detail: t("privacy.retentionBody") },
          ]}
        />
      </Group>

      <Group title={t("privacy.whoTitle")} hint={t("privacy.whoHint")}>
        <Facts
          rows={[
            { term: t("privacy.youSee"), detail: t("privacy.youSeeBody") },
            { term: t("privacy.managersSee"), detail: t("privacy.managersSeeBody") },
            { term: t("privacy.ratings"), detail: t("privacy.ratingsBody") },
          ]}
        />
      </Group>

      <Group title={t("privacy.controlTitle")} hint={t("privacy.controlHint")}>
        <Facts
          rows={[
            { term: t("privacy.stop"), detail: t("privacy.stopBody") },
            { term: t("privacy.review"), detail: t("privacy.reviewBody") },
          ]}
        />
      </Group>

      <p className="text-[13px] text-muted-foreground">
        {t("privacy.moreLead")}{" "}
        <Link href="/privacy#ai" className="underline underline-offset-4 hover:text-foreground">
          {t("privacy.moreLink")}
        </Link>
      </p>
    </div>
  );
}
