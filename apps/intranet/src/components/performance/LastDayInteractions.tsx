"use client";

import { useRef, useState, type UIEvent } from "react";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { fmtDuration, fmtNum } from "./PerformanceFormat";

export interface LastDayInteractionRow {
  date: string;
  count: number;
  avgDurationSec: number;
  totalDurationSec: number;
  employeeId?: string;
  employeeName?: string;
}

const SLIDE_SIZE = 3;

/** "Alex GRUBER" -> "Alex G." — enough to tell employees apart in the chip
 * row without the full surname eating space. */
function abbreviateName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

function StatBlock({ label, value, size }: { label: string; value: string; size: "lg" | "md" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "tabular-nums",
          size === "lg" ? "text-3xl font-bold" : "text-lg font-semibold",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function EmployeeStats({ row }: { row: LastDayInteractionRow }) {
  const t = useTranslations("Performance");
  return (
    <>
      <StatBlock label={t("interactionsStatCount")} value={fmtNum(row.count)} size="lg" />
      <div className="flex gap-6">
        <StatBlock
          label={t("callsAvgDurationLabel")}
          value={fmtDuration(row.avgDurationSec)}
          size="md"
        />
        <StatBlock
          label={t("callsTotalTalkLabel")}
          value={fmtDuration(row.totalDurationSec)}
          size="md"
        />
      </div>
    </>
  );
}

/** Replaces the closed-won trend chart at the top of the Interaktionen tab:
 * always the most recent day with any interactions, broken out per employee
 * on the team dashboard (rows carry `employeeName` there — see
 * `interactionsMonth`'s team-wide shape) or a single stat set on the
 * employee view (rows never carry `employeeName` there).
 *
 * Team view: a scroll-snap carousel of up to `SLIDE_SIZE` employee cards per
 * slide (same native-scroll pattern as `CvReviewForm`'s mobile carousel —
 * no carousel library needed), with a name-chip row below to jump straight
 * to any employee's slide. */
export function LastDayInteractions({
  days,
  locale,
}: {
  days: LastDayInteractionRow[];
  locale: string;
}) {
  const t = useTranslations("Performance");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const withData = days.filter((d) => d.count > 0);
  const lastDate = withData.reduce(
    (max, d) => (d.date > max ? d.date : max),
    withData[0]?.date ?? "",
  );
  const rows = withData.filter((d) => d.date === lastDate);
  const isTeam = rows.some((r) => r.employeeName !== undefined);

  const slides: LastDayInteractionRow[][] = [];
  for (let i = 0; i < rows.length; i += SLIDE_SIZE) {
    slides.push(rows.slice(i, i + SLIDE_SIZE));
  }

  if (withData.length === 0) return null;

  const title = t("lastDayInteractionsTitle", {
    date: formatIsoDate(lastDate, locale),
  });

  function scrollToSlide(index: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    setActiveSlide(index);
  }

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    setActiveSlide(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (!isTeam) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <EmployeeStats row={rows[0]} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="grid w-full shrink-0 snap-center gap-3"
              style={{
                gridTemplateColumns: `repeat(${slide.length}, minmax(0, 1fr))`,
              }}
            >
              {slide.map((row) => (
                <div
                  key={row.employeeId ?? row.employeeName}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 p-4"
                >
                  <span className="text-sm font-medium">{row.employeeName}</span>
                  <EmployeeStats row={row} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {slides.length > 1 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5 border-t pt-3">
            {rows.map((row, i) => {
              const slideIndex = Math.floor(i / SLIDE_SIZE);
              const active = slideIndex === activeSlide;
              return (
                <button
                  key={row.employeeId ?? row.employeeName}
                  type="button"
                  onClick={() => scrollToSlide(slideIndex)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {abbreviateName(row.employeeName ?? "")}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
