"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { berlinParts } from "@advantis/convex/time";
import { useQuery } from "convex/react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  ForgottenClockOutNotice,
  KitchenNotice,
  useTimeClock,
} from "@/components/zeiterfassung/parts";
import { SwipeToConfirm } from "@/components/zeiterfassung/SwipeToConfirm";

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
export function ClockInPrompt({
  onOpenChange,
}: {
  /** Lets the shell hold back other pop-ups while this one is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Zeiterfassung.prompt");
  const tk = useTranslations("Zeiterfassung.clock.kitchen");
  const user = useCurrentUser();
  const mode = useQuery(api.time.mode.status);
  const clock = useTimeClock();
  const [open, setOpen] = useState(false);
  const [decided, setDecided] = useState(false);
  const [showKitchen, setShowKitchen] = useState(false);
  // The clock's status flips before the mutation resolves; without this the
  // effect below would close the dialog before it can show the kitchen note.
  const clockingIn = useRef(false);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const status = clock.state?.status;
  const today = berlinParts(Date.now());

  useEffect(() => {
    if (decided || !mode?.canClock || status !== "out") return;
    const { hour, date } = berlinParts(Date.now());
    if (hour < FROM_HOUR || hour >= TO_HOUR) return;
    if (dismissedOn() === date) return;
    setOpen(true);
    setDecided(true);
  }, [decided, mode?.canClock, status]);

  // Clocked in somewhere else (header pill, another tab) — nothing to ask.
  useEffect(() => {
    if (status && status !== "out" && !clockingIn.current) setOpen(false);
  }, [status]);

  function dismiss() {
    rememberDismissed(today.date);
    setOpen(false);
  }

  async function clockIn() {
    rememberDismissed(today.date);
    clockingIn.current = true;
    const ok = await clock.clockInNow();
    clockingIn.current = false;
    if (!ok) return;
    if (clock.kitchenToday) setShowKitchen(true);
    else setOpen(false);
  }

  const greeting = today.hour < 11 ? "morning" : today.hour < 17 ? "day" : "evening";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      title={showKitchen ? tk("title") : t(`greeting.${greeting}`, { name: user.firstName ?? "" })}
      description={showKitchen ? undefined : t("description")}
      footer={
        showKitchen ? (
          <Button onClick={dismiss} className="w-full sm:w-auto">
            {tk("ok")}
          </Button>
        ) : (
          <Button variant="ghost" onClick={dismiss} className="w-full sm:w-auto">
            {t("later")}
          </Button>
        )
      }
    >
      {showKitchen ? (
        <KitchenNotice>{tk("afterIn")}</KitchenNotice>
      ) : (
        <div className="space-y-4">
          {clock.forgotten && (
            <ForgottenClockOutNotice day={clock.forgotten} onNavigate={dismiss} />
          )}
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
          <SwipeToConfirm
            label={t("slide")}
            tone="emerald"
            icon={<Play className="size-5 fill-current" />}
            disabled={clock.busy}
            onConfirm={() => void clockIn()}
          />
        </div>
      )}
    </ResponsiveDialog>
  );
}
