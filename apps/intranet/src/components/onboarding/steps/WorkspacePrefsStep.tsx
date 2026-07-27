"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const START_PAGES = ["/", "/calendar", "/absences", "/announcements", "/chat", "/files"] as const;

export function WorkspacePrefsStep() {
  const t = useTranslations("Onboarding");
  const ts = useTranslations("Settings");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);

  const pageLabel: Record<(typeof START_PAGES)[number], string> = {
    "/": ts("pageDashboard"),
    "/calendar": ts("pageCalendar"),
    "/absences": ts("pageAbsences"),
    "/announcements": ts("pageAnnouncements"),
    "/chat": ts("pageChat"),
    "/files": ts("pageFiles"),
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("workspaceTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspaceHint")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{ts("defaultCalendarView")}</Label>
          <Select
            value={prefs?.defaultCalendarView ?? "month"}
            onValueChange={(v) =>
              void setPrefs({
                defaultCalendarView: v as "month" | "week" | "list",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{ts("viewMonth")}</SelectItem>
              <SelectItem value="week">{ts("viewWeek")}</SelectItem>
              <SelectItem value="list">{ts("viewList")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{ts("startPage")}</Label>
          <Select
            value={prefs?.startPage ?? "/"}
            onValueChange={(v) => void setPrefs({ startPage: v })}
          >
            <SelectTrigger>
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
        </div>
        <div className="space-y-1.5">
          <Label>{ts("weekStart")}</Label>
          <Select
            value={prefs?.weekStartsOn ?? "monday"}
            onValueChange={(v) => void setPrefs({ weekStartsOn: v as "monday" | "sunday" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monday">{ts("monday")}</SelectItem>
              <SelectItem value="sunday">{ts("sunday")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
