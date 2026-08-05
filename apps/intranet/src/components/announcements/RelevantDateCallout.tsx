"use client";

import { useEffect, useState } from "react";

import { CalendarDays, CalendarPlus, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { RichDatePrompt } from "@/components/ui/rich-date-prompt";
import { useRichDateCalendar } from "@/hooks/use-rich-date-calendar";
import { formatRichDate, hasCalendarPayload, type RichDateValue } from "@/lib/rich-date";
import { cn } from "@/lib/utils";

export function RelevantDateCallout({
  value,
  summary,
  className,
  autoSave = true,
}: {
  value: RichDateValue;
  summary: string;
  className?: string;
  autoSave?: boolean;
}) {
  const t = useTranslations("RichText");
  const locale = useLocale();
  const { addToCalendar: saveToCalendar, busy, isExternal } = useRichDateCalendar();
  const [promptOpen, setPromptOpen] = useState(false);
  const complete = hasCalendarPayload(value);
  const { id, startAt, endAt, allDay, kind, description, location } = value;

  useEffect(() => {
    if (!autoSave || isExternal || !complete) return;
    void saveToCalendar({ id, startAt, endAt, allDay, kind, description, location }, summary, {
      automatic: true,
      silent: true,
    });
  }, [
    allDay,
    autoSave,
    complete,
    description,
    endAt,
    id,
    isExternal,
    kind,
    location,
    saveToCalendar,
    startAt,
    summary,
  ]);

  function addToCalendar() {
    if (complete) {
      void saveToCalendar(value, summary);
    } else {
      setPromptOpen(true);
    }
  }

  const kindLabel = value.kind
    ? {
        event: t("kindEvent"),
        deadline: t("kindDeadline"),
        reminder: t("kindReminder"),
      }[value.kind]
    : null;

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-2.5 border-y border-border/60 bg-muted/35 px-5 py-2.5 sm:flex-row sm:items-center",
          className,
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <CalendarDays className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="font-semibold">{formatRichDate(value, locale)}</p>
            {kindLabel && (
              <span className="text-xs font-medium text-muted-foreground">{kindLabel}</span>
            )}
          </div>
          {value.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{value.description}</p>
          )}
          {value.location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{value.location}</span>
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start sm:self-auto"
          onClick={addToCalendar}
          disabled={busy}
        >
          <CalendarPlus className="mr-1.5 size-4" />
          {t(
            isExternal
              ? "saveToIntranetCalendar"
              : complete
                ? "inIntranetCalendar"
                : "addToIntranetCalendar",
          )}
        </Button>
      </div>
      <RichDatePrompt
        open={promptOpen}
        onOpenChange={setPromptOpen}
        value={value}
        summary={summary}
        busy={busy}
        submitLabel={t(isExternal ? "saveToIntranetCalendar" : "addToIntranetCalendar")}
        onSubmit={saveToCalendar}
      />
    </>
  );
}
