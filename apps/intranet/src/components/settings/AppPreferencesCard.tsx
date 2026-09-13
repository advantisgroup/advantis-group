"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { START_PAGES } from "@/lib/startPages";

export function AppPreferencesCard() {
  const t = useTranslations("Settings");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);

  const pageLabel: Record<(typeof START_PAGES)[number], string> = {
    "/": t("pageDashboard"),
    "/calendar": t("pageCalendar"),
    "/clockodo": t("pageAbsences"),
    "/announcements": t("pageAnnouncements"),
    "/chat": t("pageChat"),
    "/files": t("pageFiles"),
  };

  const calendarView = (className?: string) => (
    <Select
      value={prefs?.defaultCalendarView ?? "month"}
      onValueChange={(v) =>
        void setPrefs({
          defaultCalendarView: v as "month" | "week" | "list",
        })
      }
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="month">{t("viewMonth")}</SelectItem>
        <SelectItem value="week">{t("viewWeek")}</SelectItem>
        <SelectItem value="list">{t("viewList")}</SelectItem>
      </SelectContent>
    </Select>
  );

  const startPage = (className?: string) => (
    <Select value={prefs?.startPage ?? "/"} onValueChange={(v) => void setPrefs({ startPage: v })}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {START_PAGES.map((p) => (
          <SelectItem key={p} value={p}>
            {pageLabel[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const weekStart = (className?: string) => (
    <Select
      value={prefs?.weekStartsOn ?? "monday"}
      onValueChange={(v) => void setPrefs({ weekStartsOn: v as "monday" | "sunday" })}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="monday">{t("monday")}</SelectItem>
        <SelectItem value="sunday">{t("sunday")}</SelectItem>
      </SelectContent>
    </Select>
  );

  const control = "h-8 w-40 text-sm";
  return (
    <div data-tour="tour-settings-app-prefs">
      <SettingsSection title={t("appPrefs")} description={t("appPrefsHint")}>
        <SettingsRow title={t("startPage")} control={startPage(control)} />
        <SettingsRow title={t("defaultCalendarView")} control={calendarView(control)} />
        <SettingsRow title={t("weekStart")} control={weekStart(control)} />
      </SettingsSection>
    </div>
  );
}
