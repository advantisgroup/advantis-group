"use client";

import { useI18n } from "@/lib/activity/i18n";
import { useTabParam } from "@/lib/activity/useTabParam";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfigPanel } from "@/components/activity/admin/ConfigPanel";
import { SystemPanel } from "@/components/activity/admin/SystemPanel";
import { UsersPanel } from "@/components/activity/admin/UsersPanel";
import { AuditPanel } from "@/components/activity/admin/AuditPanel";

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
      <div>
        <h2 className="text-lg font-bold tracking-tight text-fg">
          {t("settings.heading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="config">{t("settings.tabs.config")}</TabsTrigger>
          <TabsTrigger value="system">{t("settings.tabs.system")}</TabsTrigger>
          <TabsTrigger value="users">{t("settings.tabs.users")}</TabsTrigger>
          <TabsTrigger value="audit">{t("settings.tabs.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <ConfigPanel />
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
