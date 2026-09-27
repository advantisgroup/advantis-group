"use client";

import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { WeeklyDigestToggle } from "@/components/notifications/WeeklyDigestToggle";
import { UpdatesEmailConsent } from "@/components/updates/UpdatesEmailConsent";

export default function SettingsNotificationsPage() {
  return (
    <NotificationPreferences
      deliveryExtra={
        <>
          <WeeklyDigestToggle />
          <UpdatesEmailConsent />
        </>
      }
    />
  );
}
