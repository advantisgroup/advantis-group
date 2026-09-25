"use client";

import { useEffect, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Display } from "@/components/frame";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Switch } from "@/components/ui/switch";
import { useSubmissionsOpen } from "@/hooks/use-submissions-open";
import type { AccountMetadata } from "@/lib/account";
import { api } from "@/lib/eden";

import { AccountBackLink } from "./AccountNav";
import { SettingRow, SettingSection } from "./SettingRow";

export function PreferencesPage() {
  const t = useTranslations("account.preferences");
  const locale = useLocale();
  const { user } = useUser();
  const submissionsOpen = useSubmissionsOpen();
  const metadata = (user?.unsafeMetadata ?? {}) as AccountMetadata;
  const [notify, setNotify] = useState<{ subscribed: boolean } | null>(null);

  // the site language follows you into mail sent later (status updates, replies)
  const savedLocale = metadata.locale;
  useEffect(() => {
    if (user && savedLocale !== locale) {
      void user.update({ unsafeMetadata: { ...user.unsafeMetadata, locale } });
    }
  }, [user, locale, savedLocale]);

  useEffect(() => {
    void api.notify.me.get().then(({ data }) => {
      if (data && "subscribed" in data) setNotify({ subscribed: Boolean(data.subscribed) });
    });
  }, []);

  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  const setCopies = async (on: boolean) => {
    try {
      await user.update({ unsafeMetadata: { ...metadata, inquiryCopies: on } });
      toast(on ? t("copies.on") : t("copies.off"));
    } catch {
      toast.error(t("failed"));
    }
  };

  const setNotifyList = async (on: boolean) => {
    setNotify({ subscribed: on });
    const { error } = on
      ? await api.notify.post({ email, locale })
      : await api.notify({ email: encodeURIComponent(email) }).delete({ query: { locale } });
    if (error) {
      setNotify({ subscribed: !on });
      toast.error(t("failed"));
    }
  };

  return (
    <div className="max-w-3xl">
      <AccountBackLink />
      <Display as="h1" size="md">
        {t("title")}
      </Display>

      <SettingSection title={t("site")}>
        <div className="py-5">
          <SettingsMenu />
        </div>
      </SettingSection>

      <SettingSection title={t("mail")}>
        <SettingRow label={t("copies.label")} description={t("copies.description")}>
          <Switch
            aria-label={t("copies.label")}
            checked={metadata.inquiryCopies !== false}
            onCheckedChange={(on) => void setCopies(on)}
          />
        </SettingRow>
        {/* only worth offering while the forms are closed, or to someone already waiting */}
        {notify && (submissionsOpen === false || notify.subscribed) ? (
          <SettingRow label={t("notify.label")} description={t("notify.description", { email })}>
            <Switch
              aria-label={t("notify.label")}
              checked={notify.subscribed}
              onCheckedChange={(on) => void setNotifyList(on)}
            />
          </SettingRow>
        ) : null}
      </SettingSection>
    </div>
  );
}
