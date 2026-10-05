"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { berlinParts } from "@advantis/convex/time";
import { useQuery } from "convex/react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useTimeClock } from "@/components/zeiterfassung/parts";

/** Berlin hours during which the first visit of the day gets the prompt. */
const FROM_HOUR = 7;
const TO_HOUR = 18;

const STORAGE_KEY = "zeiterfassung:clock-in-prompt";

function dismissedOn(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(date: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, date);
  } catch {
    // Private mode etc. — the prompt simply shows again on the next page.
  }
}

/**
 * "Guten Morgen, Vahan — stempel dich ein." Shown once per day on the first
 * visit between 07:00 and 18:00 Berlin to anyone who isn't clocked in yet.
 * Dismissing it keeps it away for the rest of the day; the header pill stays
 * as the small version. Mounted in the app shell so it appears wherever the
 * person lands.
 */
export function ClockInPrompt() {
  const t = useTranslations("Zeiterfassung.prompt");
  const user = useCurrentUser();
  const mode = useQuery(api.time.mode.status);
  const clock = useTimeClock();
  const [open, setOpen] = useState(false);
  const [decided, setDecided] = useState(false);

  const status = clock.state?.status;
  const today = berlinParts(Date.now());

  useEffect(() => {
    if (decided || !mode?.canUse || status !== "out") return;
    const { hour, date } = berlinParts(Date.now());
    if (hour < FROM_HOUR || hour >= TO_HOUR) return;
    if (dismissedOn() === date) return;
    setOpen(true);
    setDecided(true);
  }, [decided, mode?.canUse, status]);

  // Clocked in somewhere else (header pill, another tab) — nothing to ask.
  useEffect(() => {
    if (status && status !== "out") setOpen(false);
  }, [status]);

  function dismiss() {
    rememberDismissed(today.date);
    setOpen(false);
  }

  async function clockIn() {
    rememberDismissed(today.date);
    await clock.clockIn();
    setOpen(false);
  }

  const greeting = today.hour < 11 ? "morning" : today.hour < 17 ? "day" : "evening";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      title={t(`greeting.${greeting}`, { name: user.firstName ?? "" })}
      description={t("description")}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss} className="w-full sm:w-auto">
            {t("later")}
          </Button>
          <Button
            variant="emerald"
            size="lg"
            onClick={() => void clockIn()}
            disabled={clock.busy}
            className="w-full sm:w-auto sm:min-w-44"
          >
            <Play className="fill-current" />
            {t("clockIn")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
    </ResponsiveDialog>
  );
}
