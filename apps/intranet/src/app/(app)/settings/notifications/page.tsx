"use client";

import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { UpdatesEmailConsent } from "@/components/updates/UpdatesEmailConsent";

export default function SettingsNotificationsPage() {
  return <NotificationPreferences deliveryExtra={<UpdatesEmailConsent />} />;
}
