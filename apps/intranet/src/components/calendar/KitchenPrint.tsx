"use client";

import { addDays, berlinDate } from "@advantis/convex/time";
import { getISOWeek, startOfISOWeek } from "date-fns";
import { useLocale, useTranslations } from "next-intl";

import { PrintSheet, PrintTitle } from "@/components/print/PrintSheet";
import { formatIsoDate } from "@/lib/format";

interface PrintDuty {
  date: string;
  name: string;
}

export interface KitchenPrintWeek {
  number: number;
  days: { date: string; name: string | null }[];
}

const localDay = (date: string) => new Date(`${date}T12:00`);

/** One row per calendar week; weekends only get a column if someone has one. */
export function kitchenPrintWeeks(duties: readonly PrintDuty[]): KitchenPrintWeek[] {
  const byDate = new Map(duties.map((duty) => [duty.date, duty.name]));
  const hasWeekend = duties.some((duty) => [0, 6].includes(localDay(duty.date).getDay()));
  const mondays = [
    ...new Set(
      duties.map((duty) =>
        berlinDate(startOfISOWeek(localDay(duty.date)).getTime() + 12 * 3_600_000),
      ),
    ),
  ].sort();
  return mondays.map((monday) => ({
    number: getISOWeek(localDay(monday)),
    days: Array.from({ length: hasWeekend ? 7 : 5 }, (_, index) => {
      const date = addDays(monday, index);
      return { date, name: byDate.get(date) ?? null };
    }),
  }));
}

/** The grid on the sheet; a week reads across, so it scans from the wall. */
export function KitchenWeekTable({
  weeks,
  locale,
  weekLabel,
}: {
  weeks: KitchenPrintWeek[];
  locale: string;
  weekLabel: string;
}) {
  const weekday = (date: string) =>
    localDay(date).toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
  const shortDate = (date: string) =>
    localDay(date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr className="border-b border-foreground/30">
          <th className="w-[11mm] py-[1.5mm] text-left text-[7.5pt] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {weekLabel}
          </th>
          {weeks[0]?.days.map((day) => (
            <th
              key={day.date}
              className="px-[1.5mm] py-[1.5mm] text-left text-[9pt] font-semibold capitalize"
            >
              {weekday(day.date)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.number} className="break-inside-avoid border-b border-foreground/15">
            <td className="py-[3mm] align-top text-[12pt] font-semibold tabular-nums text-primary">
              {week.number}
            </td>
            {week.days.map((day) => (
              <td key={day.date} className="px-[1.5mm] py-[3mm] align-top">
                <span className="block text-[8pt] tabular-nums text-muted-foreground">
                  {shortDate(day.date)}
                </span>
                <span className="mt-[0.5mm] block text-[11pt] font-medium leading-tight [overflow-wrap:anywhere]">
                  {day.name ?? "–"}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The plan as a notice for the kitchen wall. Only mount it while printing is
 *  on offer: a mounted sheet replaces whatever Ctrl+P would print. */
export function KitchenPlanPrint({
  duties,
  from,
  to,
}: {
  duties: readonly PrintDuty[];
  from: string;
  to: string;
}) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const period = `${formatIsoDate(from, locale)} – ${formatIsoDate(to, locale)}`;
  return (
    <PrintSheet
      title={`${t("kitchen.legend")} ${period}`}
      area={t("title")}
      kind={t("kitchen.printKind")}
      notice={t("kitchen.printNotice")}
    >
      <PrintTitle title={t("kitchen.legend")} lead={period}>
        <span>{t("kitchen.printLead")}</span>
      </PrintTitle>
      <KitchenWeekTable
        weeks={kitchenPrintWeeks(duties)}
        locale={locale}
        weekLabel={t("kitchen.printWeek")}
      />
    </PrintSheet>
  );
}
