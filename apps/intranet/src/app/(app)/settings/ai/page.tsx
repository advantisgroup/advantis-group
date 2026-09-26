"use client";

import { type ComponentType, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { usePaginatedQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Server,
  Square,
  ThumbsUp,
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Requests go to Anthropic, so that step wears its mark. */
function AnthropicMark({ className }: { className?: string }) {
  return <Mark provider="anthropic" className={className} />;
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {hint && (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {hint}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Your last few runs, so an answer put away from the dock is one click away. */
function RecentRuns() {
  const t = useTranslations("Ai");
  const { results, status } = usePaginatedQuery(api.aiRuns.history, {}, { initialNumItems: 5 });

  return (
    <Section
      title={t("history.recentTitle")}
      hint={t("history.recentHint")}
      action={
        results.length > 0 && (
          <Link
            href="/settings/ai/history"
            className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
          >
            {t("history.seeAll")}
            <ChevronRight className="size-3.5" />
          </Link>
        )
      }
    >
      {status === "LoadingFirstPage" ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">
          {t("history.recentEmpty")}
        </p>
      ) : (
        <AiHistoryList runs={results.slice(0, 5)} />
      )}
    </Section>
  );
}

/** The same answer as you read it and as it rests in the database. */
function EncryptionSample() {
  const t = useTranslations("Ai");
  return (
    <div
      aria-hidden
      className="mt-3 grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <div className="rounded-xl border border-border/70 bg-card p-3.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Eye className="size-3" />
          {t("privacy.encYouSee")}
        </p>
        <p className="text-[12.5px] leading-relaxed">{t("privacy.encSample")}</p>
      </div>
      <ArrowRight className="mx-auto size-3.5 text-muted-foreground max-sm:rotate-90" />
      <div className="rounded-xl border border-dashed border-border bg-card p-3.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Server className="size-3" />
          {t("privacy.encDbHolds")}
        </p>
        <p className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
          q7Vd2xK9mP0aLw3n.Zr8Jf1sT6yQbHc4E.Xk2pN7vR0tLmB9sWq4eYz1aF8uGd3HjC6oIl5Vr…
        </p>
      </div>
    </div>
  );
}

/** What happens to a request, as the path it actually takes. */
function Journey() {
  const t = useTranslations("Ai");
  const steps: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    body: string;
    extra?: ReactNode;
  }[] = [
    { icon: UserRound, title: t("privacy.flowYou"), body: t("privacy.flowYouBody") },
    { icon: Server, title: t("privacy.flowApi"), body: t("privacy.flowApiBody") },
    { icon: AnthropicMark, title: t("privacy.flowModel"), body: t("privacy.flowModelBody") },
    {
      icon: Lock,
      title: t("privacy.encTitle"),
      body: t("privacy.encBody"),
      extra: <EncryptionSample />,
    },
    { icon: Trash2, title: t("privacy.deleteTitle"), body: t("privacy.encDeleted") },
  ];

  return (
    <ol>
      {steps.map((step, i) => (
        <li key={step.title} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute bottom-0 left-4 top-9 w-px bg-border/70" />
          )}
          <span className="relative grid size-8 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground">
            <step.icon className="size-4" />
          </span>
          <div className={cn("min-w-0 pt-1", i < steps.length - 1 && "pb-7")}>
            <p className="text-[14px] font-medium">{step.title}</p>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {step.body}
            </p>
            {step.extra}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Audience({
  icon: Icon,
  title,
  lines,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  lines: { icon: ComponentType<{ className?: string }>; text: string }[];
}) {
  return (
    <div className="border-border/60 p-5 max-sm:border-b max-sm:last:border-b-0 sm:border-l sm:first:border-l-0">
      <p className="flex items-center gap-2 text-[14px] font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </p>
      <ul className="mt-3 space-y-2.5">
        {lines.map((line) => (
          <li key={line.text} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
            <line.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground text-pretty">{line.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * AI in the intranet, from your side: whether you have it, what you've asked
 * it lately, what happens to a request on its way, what each feature sends,
 * and who gets to see any of it. Every line is something the code does.
 */
export default function SettingsAiPage() {
  const t = useTranslations("Ai");
  const canUseAi = useHasCapability("use_ai");

  return (
    <div className="max-w-4xl space-y-12">
      <header className="flex flex-wrap items-start gap-4">
        <AiGlyph className="mt-1 size-5" />
        <div className="min-w-[14rem] flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
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
      </header>

      <RecentRuns />

      <Section title={t("privacy.howTitle")} hint={t("privacy.howHint")}>
        <Journey />
      </Section>

      <Section title={t("privacy.featuresTitle")} hint={t("privacy.featuresHint")}>
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {AI_FEATURES.map((feature) => (
            <li key={feature.key} className="flex gap-3 px-4 py-3.5">
              <feature.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{t(`kind.${feature.key}`)}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                  {t(`privacy.feature.${feature.key}`)}
                </p>
              </div>
              <Link
                href={`/settings/ai/history?kind=${feature.key}`}
                className="inline-flex shrink-0 items-center gap-0.5 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t("privacy.featureHistory")}
                <ChevronRight className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("privacy.whoTitle")} hint={t("privacy.whoHint")}>
        <div className="grid overflow-hidden rounded-xl border border-border/70 bg-card sm:grid-cols-2">
          <Audience
            icon={UserRound}
            title={t("privacy.youSee")}
            lines={[
              { icon: Eye, text: t("privacy.youSeeBody") },
              { icon: Square, text: t("privacy.stopBody") },
              { icon: Check, text: t("privacy.reviewBody") },
              { icon: Trash2, text: t("privacy.deleteBody") },
            ]}
          />
          <Audience
            icon={Eye}
            title={t("privacy.managersSee")}
            lines={[
              { icon: Check, text: t("privacy.managersSeeBody") },
              { icon: ThumbsUp, text: t("privacy.ratingsBody") },
              { icon: EyeOff, text: t("privacy.managersNeverBody") },
            ]}
          />
        </div>
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
