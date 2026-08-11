"use client";

import { useMemo } from "react";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { ActionQueue } from "@/components/admin/overview/ActionQueue";
import { AuditFeed, JumpTo } from "@/components/admin/overview/AuditFeed";
import { AccountsRadar, OrgComposition } from "@/components/admin/overview/PeoplePanels";
import { SystemsPanel } from "@/components/admin/overview/SystemsPanel";
import { ThroughputPanel } from "@/components/admin/overview/ThroughputPanel";
import { Vitals } from "@/components/admin/overview/Vitals";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";

/**
 * The organization control room.
 *
 * Read top to bottom it answers four questions in order of how often they're
 * asked: does anything need me right now (vitals + queue), is the org getting
 * through its work (throughput), who is here and are the accounts clean
 * (people), and is anything broken (systems). The link grid that used to be the
 * whole page is last — it's navigation, not information.
 *
 * Manager+ only, matching every `adminOverview.*` query's own `requireManager`.
 * The `/admin` layout admits narrower capability holders (`manage_uploads`,
 * `access_integrations`, …) so they can reach their one subpage; they get the
 * forbidden screen here rather than a page of failed subscriptions.
 */
export default function AdminOverviewPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  // Day bucketing happens server-side but has to land on the viewer's
  // midnight, not UTC's — Convex has no timezone of its own. Memoized so the
  // query args stay referentially stable across re-renders.
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-4">
      <PageHeaderBar
        title={t("organizationTitle")}
        description={t("organizationSubtitle")}
        icon={<ShieldCheck />}
      />

      <Vitals tzOffsetMinutes={tzOffsetMinutes} />

      <ActionQueue />

      <ThroughputPanel />

      <div className="grid gap-4 lg:grid-cols-2">
        <OrgComposition tzOffsetMinutes={tzOffsetMinutes} />
        <AccountsRadar tzOffsetMinutes={tzOffsetMinutes} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SystemsPanel />
        {isAdmin ? <AuditFeed /> : <JumpTo />}
      </div>

      {isAdmin && <JumpTo />}
    </div>
  );
}
