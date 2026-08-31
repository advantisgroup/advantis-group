"use client";

import { useTranslations } from "next-intl";

import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { UpdatesEmailConsent } from "@/components/updates/UpdatesEmailConsent";

export default function SettingsNotificationsPage() {
  const tn = useTranslations("Notifications");
  const user = useCurrentUser();

  return (
    <>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-semibold tracking-tight">{tn("preferences")}</p>
            <p className="text-sm text-muted-foreground">{tn("preferencesHint")}</p>
          </div>
          <NotificationPreferences />
        </CardContent>
      </Card>
      {user.external && (
        <Card>
          <CardContent className="p-5">
            <UpdatesEmailConsent />
          </CardContent>
        </Card>
      )}
    </>
  );
}
