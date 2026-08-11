"use client";

import { Settings } from "lucide-react";

import { AuditPanel } from "@/components/activity/admin/AuditPanel";
import { ConfigPanel } from "@/components/activity/admin/ConfigPanel";
import { DiscardedPanel } from "@/components/activity/admin/DiscardedPanel";
import { SystemPanel } from "@/components/activity/admin/SystemPanel";
import { UsersPanel } from "@/components/activity/admin/UsersPanel";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  return (
    <section className="space-y-6">
      <PageHeader
        title={t("settings.heading")}
        description={t("settings.subtitle")}
        icon={<Settings />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        {/* A full-width horizontal strip here would be a second control
            competing with the mobile bottom nav's thumb-zone space, so below
            md this collapses to a single compact Select instead. */}
        <TabsList className="hidden md:inline-flex">
          <TabsTrigger value="config">{t("settings.tabs.config")}</TabsTrigger>
          <TabsTrigger value="system">{t("settings.tabs.system")}</TabsTrigger>
          <TabsTrigger value="users">{t("settings.tabs.users")}</TabsTrigger>
          <TabsTrigger value="audit">{t("settings.tabs.audit")}</TabsTrigger>
          {/* Audit surface, not a daily view: the trigger only appears while
              the tab is open — it is reached via the "Discarded data" button
              under Configuration (or a deep link), not browsed into. */}
          {tab === "discarded" && (
            <TabsTrigger value="discarded">{t("settings.tabs.discarded")}</TabsTrigger>
          )}
        </TabsList>
        <Select value={tab} onValueChange={setTab}>
          <SelectTrigger className="md:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="config">{t("settings.tabs.config")}</SelectItem>
            <SelectItem value="system">{t("settings.tabs.system")}</SelectItem>
            <SelectItem value="users">{t("settings.tabs.users")}</SelectItem>
            <SelectItem value="audit">{t("settings.tabs.audit")}</SelectItem>
            {tab === "discarded" && (
              <SelectItem value="discarded">{t("settings.tabs.discarded")}</SelectItem>
            )}
          </SelectContent>
        </Select>

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
