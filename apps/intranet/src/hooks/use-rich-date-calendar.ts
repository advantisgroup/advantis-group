"use client";

import { useCallback, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCurrentUser } from "@/components/providers/current-user";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { richDateCalendarId, richDateEndTimestamp, type RichDateValue } from "@/lib/rich-date";

export function useRichDateCalendar() {
  const t = useTranslations("RichText");
  const user = useCurrentUser();
  const addRichDate = useMutation(api.events.addRichDateToMine);
  const handleError = useErrorHandler();
  const [busy, setBusy] = useState(false);

  const addToCalendar = useCallback(
    async (
      value: RichDateValue,
      summary: string,
      options?: { silent?: boolean },
    ): Promise<boolean> => {
      setBusy(true);
      try {
        const result = await addRichDate({
          richDateId: richDateCalendarId(value, summary),
          title: summary.trim() || t("calendarEventTitleFallback"),
          description: value.description,
          location: value.location,
          start: value.startAt,
          end: richDateEndTimestamp(value),
          allDay: value.allDay,
          kind: value.kind,
        });
        if (!options?.silent) {
          toast.success(
            t(
              result.created
                ? "addedToIntranetCalendar"
                : result.updated
                  ? "updatedInIntranetCalendar"
                  : "alreadyInIntranetCalendar",
            ),
          );
        }
        return true;
      } catch (error) {
        handleError(error);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addRichDate, handleError, t],
  );

  return {
    addToCalendar,
    busy,
    isExternal: user.external,
  };
}
