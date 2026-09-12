"use client";

import { type ComponentType, type ReactNode } from "react";

import {
  ArrowRight,
  CalendarCheck,
  Check,
  CircleHelp,
  Eye,
  FileText,
  FileUp,
  Lock,
  type LucideIcon,
  MessagesSquare,
  PhoneCall,
  RefreshCw,
  Server,
  Square,
  Tags,
  ThumbsUp,
  Timer,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { cn } from "@/lib/utils";

/** The AI features that can start a run, in the order someone meets them —
 * each with the icon that says what kind of work it is before the words do. */
const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: "wikiChat", icon: MessagesSquare },
  { key: "wikiFormat", icon: WandSparkles },
  { key: "wikiMeta", icon: Tags },
  { key: "coachReport", icon: PhoneCall },
  { key: "coachEod", icon: CalendarCheck },
  { key: "coachWikiExtract", icon: FileUp },
  { key: "cvExtract", icon: FileText },
  { key: "cvRescan", icon: RefreshCw },
  { key: "ask", icon: CircleHelp },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
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

/** Icon, name, one line. The unit this page is built from — it reads in a
 * glance, which a label/paragraph row never does. */
function Tile({
  icon: Icon,
  title,
  body,
  tone = "muted",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: "muted" | "ai";
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card p-3.5 transition-colors hover:border-border">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          tone === "ai" ? "ai-edge [--ai-ground:var(--card)]" : "bg-muted/70 text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium leading-snug">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
          {body}
        </p>
      </div>
    </div>
  );
}

/** One hop on the path a request takes. */
function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-border/60 bg-card p-3.5">
      <span className="grid size-8 place-items-center rounded-lg bg-muted/70 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="mt-2.5 text-[13.5px] font-medium">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}

function Line({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 text-muted-foreground text-pretty">{children}</span>
    </li>
  );
}

/**
 * What the AI can see, in plain words.
 *
 * Every line here is something the code actually does — where a feature sends
 * text, what is kept, for how long, and who else can see it. An assistant
 * inside an intranet holding absences and HR documents only gets used if
 * that's answerable without asking an engineer, so this is built to be
 * skimmed: icons first, one line each, no controls anywhere on the page.
 */
export default function SettingsAiPage() {
  const t = useTranslations("Ai");
  const canUseAi = useHasCapability("use_ai");

  return (
    <div className="max-w-4xl space-y-10">
      {/* The whole answer at a glance: can I use it, where does it go, how
          long does it stay, who else sees it. */}
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-start gap-3.5 p-5">
          <span className="ai-edge grid size-10 shrink-0 place-items-center rounded-xl [--ai-ground:var(--card)]">
            <AiGlyph className="size-5" />
          </span>
          <div className="min-w-[14rem] flex-1">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em]">
              <span className="ai-text">{t("eyebrow")}</span>
            </p>
            <h1 className="mt-0.5 font-display text-lg font-semibold tracking-tight">
              {canUseAi ? t("privacy.accessOn") : t("privacy.accessOff")}
            </h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
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
        <dl className="grid divide-y divide-border/60 border-t border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            {
              icon: Server,
              term: t("privacy.metaProvider"),
              value: t("privacy.metaProviderValue"),
            },
            {
              icon: Timer,
              term: t("privacy.metaRetention"),
              value: t("privacy.metaRetentionValue"),
            },
            {
              icon: Eye,
              term: t("privacy.metaVisibility"),
              value: t("privacy.metaVisibilityValue"),
            },
          ].map((meta) => (
            <div key={meta.term} className="px-5 py-3.5">
              <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <meta.icon className="size-3.5" />
                {meta.term}
              </dt>
              <dd className="mt-0.5 text-[13.5px] font-medium">{meta.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Section title={t("privacy.featuresTitle")} hint={t("privacy.featuresHint")}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Tile
              key={feature.key}
              icon={feature.icon}
              title={t(`kind.${feature.key}`)}
              body={t(`privacy.feature.${feature.key}`)}
            />
          ))}
        </div>
      </Section>

      <Section title={t("privacy.whereTitle")} hint={t("privacy.whereHint")}>
        {/* The path itself, rather than three paragraphs describing it. */}
        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
          <Step icon={UserRound} title={t("privacy.flowYou")} body={t("privacy.flowYouBody")} />
          <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" />
          <Step icon={Server} title={t("privacy.flowApi")} body={t("privacy.flowApiBody")} />
          <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" />
          {/* The one hop that leaves the building wears the app's AI mark. */}
          <Step icon={AiGlyph} title={t("privacy.flowModel")} body={t("privacy.flowModelBody")} />
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Tile icon={Server} title={t("privacy.provider")} body={t("privacy.providerBody")} />
          <Tile icon={Lock} title={t("privacy.storage")} body={t("privacy.storageBody")} />
          <Tile icon={Timer} title={t("privacy.retention")} body={t("privacy.retentionBody")} />
        </div>
      </Section>

      <Section title={t("privacy.whoTitle")} hint={t("privacy.whoHint")}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-medium">
              <UserRound className="size-4 text-muted-foreground" />
              {t("privacy.youSee")}
            </p>
            <ul className="mt-3 space-y-2">
              <Line icon={Check}>{t("privacy.youSeeBody")}</Line>
              <Line icon={ThumbsUp}>{t("privacy.ratingsBody")}</Line>
            </ul>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-medium">
              <Eye className="size-4 text-muted-foreground" />
              {t("privacy.managersSee")}
            </p>
            <ul className="mt-3 space-y-2">
              <Line icon={Check}>{t("privacy.managersSeeBody")}</Line>
              <Line icon={Lock}>{t("privacy.managersNeverBody")}</Line>
            </ul>
          </div>
        </div>
      </Section>

      <Section title={t("privacy.controlTitle")} hint={t("privacy.controlHint")}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Tile icon={Square} title={t("privacy.stop")} body={t("privacy.stopBody")} />
          <Tile icon={ThumbsUp} title={t("privacy.review")} body={t("privacy.reviewBody")} />
        </div>
      </Section>

      <p className="text-[13px] text-muted-foreground">
        {t("privacy.moreLead")}{" "}
        <Link href="/privacy#ai" className="underline underline-offset-4 hover:text-foreground">
          {t("privacy.moreLink")}
        </Link>
      </p>
    </div>
  );
}
