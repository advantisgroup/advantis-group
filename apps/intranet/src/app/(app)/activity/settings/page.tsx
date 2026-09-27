"use client";

import { Archive, HeartPulse, ScrollText, Settings, SlidersHorizontal, Users } from "lucide-react";

import { AuditPanel } from "@/components/activity/admin/AuditPanel";
import { ConfigPanel } from "@/components/activity/admin/ConfigPanel";
import { DiscardedPanel } from "@/components/activity/admin/DiscardedPanel";
import { SystemPanel } from "@/components/activity/admin/SystemPanel";
import { UsersPanel } from "@/components/activity/admin/UsersPanel";
import { PageHeader } from "@/components/PageHeader";
import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/lib/activity/i18n";
import { useTabParam } from "@/lib/activity/useTabParam";

/**
 * Admin hub: configuration, system health, and the audit log gathered under one
 * tabbed page so the sidebar stays short. Admin-gated by the surrounding
 * `/admin` route. User & role management lives in the intranet-wide admin area,
 * and email-domain access is governed at the intranet level, so the Users tab
 * links out to it and the Access card (under Configuration) is read-only.
 */
export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useTabParam("config");
  const tabFor = (value: string, label: string, icon: RouteTab["icon"]): RouteTab => ({
    value,
    label,
    icon,
    href: `/activity/settings?tab=${value}`,
    onSelect: () => setTab(value),
  });
  const tabs = [
    tabFor("config", t("settings.tabs.config"), SlidersHorizontal),
    tabFor("system", t("settings.tabs.system"), HeartPulse),
    tabFor("users", t("settings.tabs.users"), Users),
    tabFor("audit", t("settings.tabs.audit"), ScrollText),
    // Audit surface, not a daily view: the tab only appears while it's open —
    // it's reached via the "Discarded data" button under Configuration (or a
    // deep link), not browsed into.
    ...(tab === "discarded" ? [tabFor("discarded", t("settings.tabs.discarded"), Archive)] : []),
  ];
  return (
    <section className="space-y-6">
      <PageHeader
        title={t("settings.heading")}
        description={t("settings.subtitle")}
        icon={<Settings />}
      />

      <RouteTabs tabs={tabs} activeValue={tab} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="config">
          <ConfigPanel onOpenDiscarded={() => setTab("discarded")} />
        </TabsContent>

        <TabsContent value="discarded">
          <DiscardedPanel />
        </TabsContent>
        <TabsContent value="system">
          <SystemPanel />
        </TabsContent>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </section>
  );
}
