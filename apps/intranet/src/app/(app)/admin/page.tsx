"use client";

import { useMemo } from "react";

import { useRouter } from "next/navigation";

import { ShieldCheck, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { ActionQueue } from "@/components/admin/overview/ActionQueue";
import { AuditFeed, JumpTo } from "@/components/admin/overview/AuditFeed";
import { BackupsPanel } from "@/components/admin/overview/BackupsPanel";
import { FeatureFlagsPanel } from "@/components/admin/overview/FeatureFlagsPanel";
import { AccountsRadar, OrgComposition } from "@/components/admin/overview/PeoplePanels";
import { SystemsPanel } from "@/components/admin/overview/SystemsPanel";
import { ThroughputPanel } from "@/components/admin/overview/ThroughputPanel";
import { Vitals } from "@/components/admin/overview/Vitals";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";

/**
 * The organization control room.
 *
 * Read top to bottom it answers four questions in order of how often they're
 * asked: what's the state of things and does anything need me (vitals +
 * queue), is the org getting through its work (throughput), who is here and
 * are the accounts clean (people), and is anything broken (systems). The link
 * grid is last — it's navigation, not information.
 *
 * Manager+ only, matching every `adminOverview.*` query's own `requireManager`.
 * The `/admin` layout admits narrower capability holders (`manage_uploads`,
 * `access_integrations`, …) so they can reach their one subpage; they get the
 * forbidden screen here rather than a page of failed subscriptions.
 */
export default function AdminOverviewPage() {
  const t = useTranslations("Admin");
  const router = useRouter();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  // Day bucketing happens server-side but has to land on the viewer's
  // midnight, not UTC's — Convex has no timezone of its own. Memoized so the
  // query args stay referentially stable across re-renders.
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const actions = useMemo(
    () => [
      {
        key: "new",
        label: t("overview.invite"),
        icon: UserPlus,
        onClick: () => router.push("/admin/onboard"),
      },
    ],
    [t, router],
  );

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      <PageHeaderBar
        title={t("organizationTitle")}
        description={t("organizationSubtitle")}
        icon={<ShieldCheck />}
      />
      <PageHeaderActions actions={actions} />

      <Vitals tzOffsetMinutes={tzOffsetMinutes} />

      <ActionQueue />

      <ThroughputPanel />

      <div className="grid gap-5 lg:grid-cols-2">
        <OrgComposition tzOffsetMinutes={tzOffsetMinutes} />
        <AccountsRadar tzOffsetMinutes={tzOffsetMinutes} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <SystemsPanel />
        {isAdmin ? (
          <div className="space-y-5">
            <FeatureFlagsPanel />
            <BackupsPanel />
          </div>
        ) : (
          <JumpTo />
        )}
      </div>

      {isAdmin && (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <AuditFeed />
          <JumpTo />
        </div>
      )}
    </div>
  );
}
