"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { localIsoDate } from "@/lib/absences";
import { activeStatusMessage, type StatusDuration, statusUntil } from "@/lib/status-message";

const MAX_LENGTH = 120;
const PRESETS = ["presetMeeting", "presetHome", "presetSick", "presetVacation"] as const;
const DURATIONS: StatusDuration[] = ["today", "tomorrow", "week", "date", "never"];

/** Set, change or clear your own status note. */
export function StatusMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Profile");
  const tc = useTranslations("Common");
  const user = useCurrentUser();
  const current = activeStatusMessage(user.statusMessage);
  const setStatus = useMutation(api.people.users.setStatusMessage);
  const handleError = useErrorHandler();
  const [text, setText] = useState(current?.text ?? "");
  const [duration, setDuration] = useState<StatusDuration>(current ? "never" : "today");
  const [date, setDate] = useState(() => localIsoDate(new Date()));
  const [busy, setBusy] = useState(false);

  function reset(next: boolean) {
    onOpenChange(next);
    if (next) {
      setText(current?.text ?? "");
      setDuration(current?.until ? "date" : current ? "never" : "today");
      setDate(localIsoDate(current?.until ? new Date(current.until) : new Date()));
    }
  }

  async function save(value: string) {
    setBusy(true);
    try {
      await setStatus({
        text: value,
        until: value.trim() ? statusUntil(duration, date) : undefined,
      });
      toast.success(value.trim() ? t("statusSaved") : t("statusCleared"));
      onOpenChange(false);
    } catch (e) {
      handleError(e, t("statusSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={reset}
      title={t("statusTitle")}
      description={t("statusDescription")}
      footer={
        <>
          {current && (
            <Button variant="ghost" disabled={busy} onClick={() => void save("")}>
              {t("statusClear")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={busy || !text.trim()} onClick={() => void save(text)}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Input
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("statusPlaceholder")}
            aria-label={t("statusTitle")}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setText(t(key))}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("statusClearAfter")}
          </label>
          <div className="flex gap-2">
            <Select value={duration} onValueChange={(v) => setDuration(v as StatusDuration)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {t(`statusDuration.${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {duration === "date" && (
              <Input
                type="date"
                className="flex-1"
                value={date}
                min={localIsoDate(new Date())}
                onChange={(e) => setDate(e.target.value)}
                aria-label={t("statusDuration.date")}
              />
            )}
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
