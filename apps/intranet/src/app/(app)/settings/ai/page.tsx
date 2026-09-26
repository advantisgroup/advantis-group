"use client";

import { type ComponentType, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { usePaginatedQuery } from "convex/react";
import {
  Check,
  ChevronRight,
  Eye,
  KeyRound,
  Lock,
  Server,
  Square,
  ThumbsUp,
  Timer,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { AiHistoryList } from "@/components/ai/AiHistoryList";
import { AI_FEATURES } from "@/components/ai/features";
import { Mark } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { cn } from "@/lib/utils";

/** Requests go to Anthropic, so the hops and facts about the model wear its mark. */
function AnthropicMark({ className }: { className?: string }) {
  return <Mark provider="anthropic" className={className} />;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function IconSquare({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

/** Your last few runs, so an answer put away from the dock is one click away. */
function RecentRuns() {
  const t = useTranslations("Ai");
  const { results, status } = usePaginatedQuery(api.aiRuns.history, {}, { initialNumItems: 5 });
  if (status === "LoadingFirstPage" || results.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{t("history.recentTitle")}</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {t("history.recentHint")}
          </p>
        </div>
        <Link
          href="/settings/ai/history"
          className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
        >
          {t("history.seeAll")}
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
      <AiHistoryList runs={results.slice(0, 5)} />
    </section>
  );
}

/**
 * What the AI can see, in plain words.
 *
 * Every line here is something the code actually does — where a feature sends
 * text, what is kept, for how long, and who else can see it. Built to be
 * skimmed: one surface per question instead of a wall of equal cards, with
 * the encryption — the part people worry about — given its own room.
 */
export default function SettingsAiPage() {
  const t = useTranslations("Ai");
  const canUseAi = useHasCapability("use_ai");

  const facts = [
    { icon: AnthropicMark, term: t("privacy.metaProvider"), value: t("privacy.metaProviderValue") },
    { icon: Lock, term: t("privacy.metaStorage"), value: t("privacy.metaStorageValue") },
    { icon: Timer, term: t("privacy.metaRetention"), value: t("privacy.metaRetentionValue") },
    { icon: Eye, term: t("privacy.metaVisibility"), value: t("privacy.metaVisibilityValue") },
  ];

  const steps = [
    { icon: UserRound, title: t("privacy.flowYou"), body: t("privacy.flowYouBody") },
    { icon: Server, title: t("privacy.flowApi"), body: t("privacy.flowApiBody") },
    { icon: AnthropicMark, title: t("privacy.flowModel"), body: t("privacy.flowModelBody") },
  ];

  return (
    <div className="max-w-4xl space-y-12">
      <header className="space-y-5">
        <div className="flex flex-wrap items-start gap-4">
          <AiGlyph className="size-5" />
          <div className="min-w-[14rem] flex-1">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {canUseAi ? t("privacy.accessOn") : t("privacy.accessOff")}
            </h1>
            <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              {canUseAi ? t("privacy.accessOnBody") : t("privacy.accessOffBody")}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium",
              canUseAi
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/35 bg-warning/10 text-warning",
            )}
          >
            {canUseAi ? <Check className="size-3.5" /> : <Lock className="size-3.5" />}
            {canUseAi ? t("privacy.badgeOn") : t("privacy.badgeOff")}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-y-4 border-y border-border/60 py-4 sm:grid-cols-4">
          {facts.map((fact) => (
            <div
              key={fact.term}
              className="min-w-0 sm:border-l sm:border-border/60 sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
            >
              <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <fact.icon className="size-3.5" />
                {fact.term}
              </dt>
              <dd className="mt-1 text-[14px] font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <RecentRuns />

      {/* The part people actually worry about, given room of its own. */}
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-7">
          <div>
            <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success ring-8 ring-success/5">
              <Lock className="size-5" />
            </span>
            <h2 className="mt-5 font-display text-xl font-semibold tracking-tight text-balance">
              {t("privacy.encTitle")}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              {t("privacy.encBody")}
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                { icon: Lock, text: t("privacy.encAlgo") },
                { icon: KeyRound, text: t("privacy.encKey") },
                { icon: Trash2, text: t("privacy.encDeleted") },
              ].map((item) => (
                <li
                  key={item.text}
                  className="flex items-start gap-2.5 text-[13px] leading-relaxed"
                >
                  <item.icon className="mt-0.5 size-3.5 shrink-0 text-success" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* What that looks like: the same answer, as you see it and as it rests. */}
          <div className="flex flex-col justify-center gap-3" aria-hidden>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Eye className="size-3" />
                {t("privacy.encYouSee")}
              </p>
              <p className="text-[13px] leading-relaxed">{t("privacy.encSample")}</p>
            </div>
            <div className="flex justify-center text-muted-foreground">
              <Lock className="size-3.5" />
            </div>
            <div className="rounded-xl border border-dashed border-border bg-background p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Server className="size-3" />
                {t("privacy.encDbHolds")}
              </p>
              <p className="break-all font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                q7Vd2xK9mP0aLw3n.Zr8Jf1sT6yQbHc4E.
                <span className="opacity-60">
                  Xk2pN7vR0tLmB9sWq4eYz1aF8uGd3HjC6oIl5VrKxT2nM9bQwE7yZs4pA0cLfD8gJ
                </span>
                …
              </p>
            </div>
          </div>
        </div>
      </section>

      <Section title={t("privacy.whereTitle")} hint={t("privacy.whereHint")}>
        {/* One path, three equal stops. */}
        <ol className="grid overflow-hidden rounded-2xl border border-border/70 bg-card sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="relative flex flex-col gap-2.5 border-border/60 p-5 max-sm:border-b max-sm:last:border-b-0 sm:border-l sm:first:border-l-0"
            >
              {i > 0 && (
                <span className="absolute -left-2.5 top-8 hidden size-5 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground sm:grid">
                  <ChevronRight className="size-3" />
                </span>
              )}
              <div className="flex items-center gap-2.5">
                <IconSquare icon={step.icon} />
                <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              </div>
              <p className="text-[14px] font-medium">{step.title}</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t("privacy.featuresTitle")} hint={t("privacy.featuresHint")}>
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
          {AI_FEATURES.map((feature) => (
            <li
              key={feature.key}
              className="grid gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[13rem_minmax(0,1fr)]"
            >
              <p className="flex items-center gap-2.5 text-[13.5px] font-medium">
                <feature.icon className="size-4 shrink-0 text-muted-foreground" />
                {t(`kind.${feature.key}`)}
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty sm:pt-px">
                {t(`privacy.feature.${feature.key}`)}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("privacy.whoTitle")} hint={t("privacy.whoHint")}>
        <div className="grid overflow-hidden rounded-2xl border border-border/70 bg-card sm:grid-cols-2">
          {[
            {
              icon: UserRound,
              title: t("privacy.youSee"),
              lines: [
                { icon: Check, text: t("privacy.youSeeBody") },
                { icon: ThumbsUp, text: t("privacy.ratingsBody") },
              ],
            },
            {
              icon: Eye,
              title: t("privacy.managersSee"),
              lines: [
                { icon: Check, text: t("privacy.managersSeeBody") },
                { icon: Lock, text: t("privacy.managersNeverBody") },
              ],
            },
          ].map((group) => (
            <div
              key={group.title}
              className="border-border/60 p-5 max-sm:border-b max-sm:last:border-b-0 sm:border-l sm:first:border-l-0"
            >
              <p className="flex items-center gap-2 text-[14px] font-medium">
                <group.icon className="size-4 text-muted-foreground" />
                {group.title}
              </p>
              <ul className="mt-3 space-y-2.5">
                {group.lines.map((line) => (
                  <li
                    key={line.text}
                    className="flex items-start gap-2.5 text-[13px] leading-relaxed"
                  >
                    <line.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground text-pretty">{line.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("privacy.controlTitle")} hint={t("privacy.controlHint")}>
        <ul className="grid gap-5 sm:grid-cols-2">
          {[
            { icon: Square, title: t("privacy.stop"), body: t("privacy.stopBody") },
            { icon: ThumbsUp, title: t("privacy.review"), body: t("privacy.reviewBody") },
          ].map((item) => (
            <li key={item.title} className="flex gap-3">
              <IconSquare icon={item.icon} />
              <div>
                <p className="text-[14px] font-medium">{item.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <p className="border-t border-border/60 pt-5 text-[13px] text-muted-foreground">
        {t("privacy.moreLead")}{" "}
        <Link href="/privacy#ai" className="underline underline-offset-4 hover:text-foreground">
          {t("privacy.moreLink")}
        </Link>
      </p>
    </div>
  );
}
