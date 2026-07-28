"use client";

import { useMemo } from "react";

import { Plane } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { isoToday } from "@/lib/absences";
import { useMyAbsences } from "@/lib/absences-api";
import { formatIsoDate } from "@/lib/format";
import { pickGreeting } from "@/lib/greetings";

export function GreetingHeader() {
  const t = useTranslations("Dashboard");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const user = useCurrentUser();
  const { absences: myAbsences } = useMyAbsences();
  const today = isoToday();

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [locale],
  );

  // Picked once per mount (a full page load), not re-rolled on every render.
  const greeting = useMemo(() => pickGreeting(new Date()), []);

  const nextAbsence = useMemo(
    () =>
      (myAbsences ?? [])
        .filter((a) => a.status === "approved" && a.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0],
    [myAbsences, today],
  );

  const name = user.firstName ?? user.name;

  return (
    <div>
      <p className="text-sm font-medium capitalize text-muted-foreground">{todayLabel}</p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
        {t(greeting.titleKey, { name })}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t(greeting.subtitleKey, { name })}</p>
      {nextAbsence && (
        <Link
          href="/absences"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <Plane className="size-3.5 text-primary" />
          {t("nextAbsence", {
            type: tAbs(nextAbsence.type),
            start: formatIsoDate(nextAbsence.startDate, locale),
            end: formatIsoDate(nextAbsence.endDate, locale),
          })}
        </Link>
      )}
    </div>
  );
}
