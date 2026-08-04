"use client";

import { useState } from "react";

import { CalendarDays, CalendarPlus, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { RichDatePrompt } from "@/components/ui/rich-date-prompt";
import {
  downloadCalendarEvent,
  formatRichDate,
  hasCalendarPayload,
  type RichDateValue,
} from "@/lib/rich-date";
import { cn } from "@/lib/utils";

export function RelevantDateCallout({
  value,
  summary,
  className,
}: {
  value: RichDateValue;
  summary: string;
  className?: string;
}) {
  const t = useTranslations("RichText");
  const locale = useLocale();
  const [promptOpen, setPromptOpen] = useState(false);

  function addToCalendar() {
    if (hasCalendarPayload(value)) {
      downloadCalendarEvent(value, summary);
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
          "flex flex-col gap-3 border-y border-border/60 bg-muted/35 px-5 py-3.5 sm:flex-row sm:items-center",
          className,
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <CalendarDays className="size-4" />
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
        >
          <CalendarPlus className="mr-1.5 size-4" />
          {t("addToCalendar")}
        </Button>
      </div>
      <RichDatePrompt
        open={promptOpen}
        onOpenChange={setPromptOpen}
        value={value}
        summary={summary}
      />
    </>
  );
}
