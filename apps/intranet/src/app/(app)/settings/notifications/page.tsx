"use client";

import { useTranslations } from "next-intl";

import { ClassicNotificationPreferences } from "@/components/notifications/ClassicNotificationPreferences";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { UpdatesEmailConsent } from "@/components/updates/UpdatesEmailConsent";
import { DesignSwitch } from "@/lib/design-preview";

function ClassicSettingsNotifications() {
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
          <ClassicNotificationPreferences />
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

export default function SettingsNotificationsPage() {
  return (
    <DesignSwitch
      refreshed={<NotificationPreferences deliveryExtra={<UpdatesEmailConsent />} />}
      classic={<ClassicSettingsNotifications />}
    />
  );
}
