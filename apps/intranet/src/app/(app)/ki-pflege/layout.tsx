"use client";

import { type ReactNode, useEffect, useMemo } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  CircleHelp,
  GraduationCap,
  History,
  Lightbulb,
  MessagesSquare,
  ScrollText,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { FeatureGate } from "@/components/feature-flags/FeatureGate";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";

const TABS = [
  { value: "gaps", path: "/ki-pflege", icon: CircleHelp },
  { value: "training", path: "/ki-pflege/training", icon: MessagesSquare },
  { value: "proposals", path: "/ki-pflege/vorschlaege", icon: Lightbulb },
  { value: "rules", path: "/ki-pflege/regeln", icon: ScrollText },
  { value: "activity", path: "/ki-pflege/verlauf", icon: History },
  { value: "people", path: "/ki-pflege/personen", icon: Users },
] as const;

export default function AiTrainingLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("AiTraining");
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery(api.aiTraining.access.me);
  const counts = useQuery(api.aiTraining.access.overview);

  useEffect(() => {
    if (me && !me.trainer) router.replace("/");
  }, [me, router]);

  const tabs = useMemo<RouteTab[]>(
    () =>
      TABS.map((tab) => ({
        value: tab.value,
        href: tab.path,
        label: t(`tabs.${tab.value}`),
        icon: tab.icon,
        count:
          tab.value === "gaps"
            ? counts?.openGaps || undefined
            : tab.value === "proposals"
              ? counts?.openProposals || undefined
              : undefined,
      })),
    [t, counts],
  );
  const active =
    [...TABS].reverse().find((tab) => tab.path !== "/ki-pflege" && pathname.startsWith(tab.path))
      ?.value ?? "gaps";

  if (!me?.trainer) return null;

  return (
    <FeatureGate featureKey="ai" label={t("title")}>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeaderBar
          title={t("title")}
          description={t("intro")}
          icon={<GraduationCap className="size-4" />}
        />
        <RouteTabs tabs={tabs} activeValue={active} />
        {children}
      </div>
    </FeatureGate>
  );
}
