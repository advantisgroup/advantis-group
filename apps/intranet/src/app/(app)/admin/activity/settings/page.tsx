"use client";

import { useMutation, useQuery } from "convex/react";
import { DatabaseZap, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/use-error-handler";

export default function ActivitySettingsPage() {
  const t = useTranslations("Activity");
  const isAdmin = useCurrentUser().role === "admin";
  const handleError = useErrorHandler();

  const config = useQuery(api.activity.settings.getConfig, {});
  const setConfig = useMutation(api.activity.settings.setConfig);

  const [form, setForm] = useState({
    inactivityThresholdSeconds: 300,
    offlineThresholdSeconds: 120,
    retentionDays: 90,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  async function save() {
    setBusy(true);
    try {
      await setConfig(form);
      toast.success(t("settings.saved"));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form, labelKey: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{t(labelKey)}</Label>
      <Input
        id={key}
        type="number"
        value={form[key]}
        onChange={e =>
          setForm(f => ({ ...f, [key]: Number(e.target.value) }))
        }
        className="w-48"
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("settings.title")}
        icon={<Settings />}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.configuration")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {field("inactivityThresholdSeconds", "settings.inactivityThreshold")}
          {field("offlineThresholdSeconds", "settings.offlineThreshold")}
          {field("retentionDays", "settings.retentionDays")}
          <Button onClick={save} disabled={busy || config === undefined}>
            {t("settings.save")}
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("migration.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("migration.description")}
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/activity/migration">
                <DatabaseZap className="mr-2 h-4 w-4" />
                {t("migration.title")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
