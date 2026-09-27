"use client";

import type { ReactNode } from "react";

import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  ClipboardX,
  LifeBuoy,
  Lightbulb,
  MessageSquareHeart,
  Plane,
  Radio,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Link } from "@/components/Link";

interface Choice {
  key: string;
  href: string;
  icon: ReactNode;
}

/**
 * "Where do I go with this?" — the support modules each answer a different
 * kind of problem (an IT fault, a quality error, an idea, a question), but
 * their names only make sense once you know them. This page starts from the
 * person's situation, says in one line when each place is the right one, and
 * links straight into its create flow.
 */
export default function HelpPage() {
  const t = useTranslations("Help");
  const user = useCurrentUser();
  const aiEnabled = useAiEnabled();

  const report: Choice[] = [
    { key: "it", href: "/it-tickets?new=1", icon: <Wrench /> },
    { key: "error", href: "/fehlermanagement?new=1", icon: <ClipboardX /> },
    { key: "idea", href: "/suggestions?new=1", icon: <Lightbulb /> },
    ...(user.clockodoUserId
      ? [{ key: "absence", href: "/clockodo/requests", icon: <Plane /> }]
      : []),
  ];
  const find: Choice[] = [
    { key: "howto", href: "/guidebooks", icon: <BookOpen /> },
    ...(aiEnabled ? [{ key: "ask", href: "/wiki-chat", icon: <Sparkles /> }] : []),
    { key: "who", href: "/who-to-ask", icon: <Users /> },
    { key: "status", href: "/updates", icon: <Radio /> },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <PageHeader title={t("title")} description={t("description")} icon={<LifeBuoy />} />
      <Link
        href="/requests"
        className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ClipboardList className="size-4 shrink-0" />
        <span className="flex-1">{t("myRequestsLink")}</span>
        <ChevronRight className="size-4 shrink-0" />
      </Link>
      <ChoiceGroup title={t("reportTitle")} choices={report} />
      <ChoiceGroup title={t("findTitle")} choices={find} />
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MessageSquareHeart className="mt-0.5 size-4 shrink-0" />
        {t("pageFeedbackHint")}
      </p>
    </div>
  );
}

function ChoiceGroup({ title, choices }: { title: string; choices: Choice[] }) {
  const t = useTranslations("Help");
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
        {choices.map((choice) => (
          <li key={choice.key}>
            <Link
              href={choice.href}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-[18px]">
                {choice.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(`${choice.key}.title`)}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {t(`${choice.key}.when`)}
                </span>
              </span>
              <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:block">
                {t(`${choice.key}.cta`)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
