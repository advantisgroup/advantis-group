"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { suggestUnreachable } from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { Bookmark, BookmarkX, PhoneOff, Send, Undo2, UserRoundX, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MOOD_EMOJI } from "./shared";

type CaseId = Id<"onboardingCases">;

function useSave(caseId: CaseId) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const update = useMutation(api.performance.onboarding.update);
  return async (patch: Omit<Parameters<typeof update>[0], "caseId">, done?: string) => {
    try {
      await update({ caseId, ...patch });
      if (done) toast.success(done);
      return true;
    } catch (e) {
      handleError(e, t("case.saveError"));
      return false;
    }
  };
}

/**
 * How the customer is doing, 1 (annoyed) … 5 (happy) – only for the team,
 * never in stats or exports (feedback 03.11.). Clicking the picked one
 * again clears it.
 */
export function MoodPicker({
  caseId,
  mood,
  moodAt,
  moodByName,
}: {
  caseId: CaseId;
  mood: number | null;
  moodAt: number | null;
  moodByName: string | null;
}) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const save = useSave(caseId);
  return (
    <div className="flex flex-wrap items-center gap-2" title={t("mood.hint")}>
      <span className="text-xs font-medium text-muted-foreground">{t("mood.label")}</span>
      <div className="flex gap-0.5" role="radiogroup" aria-label={t("mood.label")}>
        {[1, 2, 3, 4, 5].map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mood === m}
            aria-label={t(`mood.${m as 1}`)}
            title={t(`mood.${m as 1}`)}
            onClick={() => void save({ mood: mood === m ? null : m })}
            className={cn(
              "rounded-full p-1 text-xl leading-none transition-all",
              mood === m
                ? "scale-110 bg-muted ring-2 ring-foreground/20"
                : mood === null
                  ? "opacity-70 hover:opacity-100"
                  : "opacity-35 grayscale hover:opacity-80 hover:grayscale-0",
            )}
          >
            {MOOD_EMOJI[m]}
          </button>
        ))}
      </div>
      {mood !== null && moodAt && (
        <span className="text-xs text-muted-foreground">
          {t(`mood.${mood as 1}`)} ·{" "}
          {t("mood.by", { name: moodByName ?? "–", date: formatDateTime(moodAt, locale) })}
        </span>
      )}
    </div>
  );
}

/** The consultant's own marker with a short reason. */
export function FlagControl({
  caseId,
  flagged,
  flagNote,
}: {
  caseId: CaseId;
  flagged: boolean;
  flagNote: string | null;
}) {
  const t = useTranslations("OnboardingCockpit");
  const save = useSave(caseId);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  if (flagged) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
        <Bookmark className="h-4 w-4 fill-warn text-warn" />
        <span className="mr-auto">
          <span className="font-medium">{t("flag.label")}:</span> {flagNote}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void save({ flag: null })}>
          <BookmarkX className="mr-1.5 h-3.5 w-3.5" />
          {t("flag.remove")}
        </Button>
      </div>
    );
  }
  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Bookmark className="mr-1.5 h-3.5 w-3.5" />
        {t("flag.set")}
      </Button>
    );
  }
  const submit = async () => {
    if (!note.trim()) {
      toast.error(t("flag.required"));
      return;
    }
    if (await save({ flag: { note } })) {
      setEditing(false);
      setNote("");
    }
  };
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Input
        autoFocus
        className="h-8 min-w-[220px] flex-1"
        value={note}
        placeholder={t("flag.placeholder")}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
      />
      <Button size="sm" onClick={() => void submit()}>
        {t("flag.save")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
        {t("flag.cancel")}
      </Button>
    </div>
  );
}

/** "Übertragen": asks a colleague to take the case over, with a note. */
export function TransferButton({ caseId }: { caseId: CaseId }) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const [open, setOpen] = useState(false);
  const targets = useQuery(api.performance.onboarding.transferTargets, open ? {} : "skip");
  const request = useMutation(api.performance.onboarding.requestTransfer);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="mr-1.5 h-3.5 w-3.5" />
        {t("transfer.button")}
      </Button>
    );
  }
  const submit = async () => {
    if (!to || !note.trim()) {
      toast.error(t("transfer.required"));
      return;
    }
    setBusy(true);
    try {
      await request({ caseId, toUserId: to as Id<"users">, note });
      toast.success(t("transfer.sent"));
      setOpen(false);
      setTo("");
      setNote("");
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="w-full space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t("transfer.title")}</h4>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={t("transfer.cancelForm")}
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {targets && targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("transfer.noTargets")}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>{t("transfer.to")}</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("transfer.choose")} />
              </SelectTrigger>
              <SelectContent>
                {(targets ?? []).map((p) => (
                  <SelectItem key={p.userId} value={p.userId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-transfer-note">{t("transfer.note")}</Label>
            <Textarea
              id="ob-transfer-note"
              rows={2}
              value={note}
              placeholder={t("transfer.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={busy} onClick={() => void submit()}>
              {t("transfer.send")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Banners at the top of the card: pending or declined handover, and the
 * suggestion to cross off a customer not reached too often. */
export function CaseBanners({
  data,
}: {
  data: {
    _id: CaseId;
    status: string;
    open: boolean;
    notReachedStreak: number;
    transferToUserId: Id<"users"> | null;
    transferToName: string | null;
    transferDeclined: { byName: string; reason: string; at: number } | null;
  };
}) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const save = useSave(data._id);
  const cancel = useMutation(api.performance.onboarding.cancelTransfer);

  return (
    <>
      {data.open && suggestUnreachable(data.notReachedStreak) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <PhoneOff className="h-4 w-4 text-destructive" />
          <span className="mr-auto font-medium">
            {t("unreachable.hint", { count: data.notReachedStreak })}
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void save({ status: "unreachable" }, t("unreachable.done"))}
          >
            {t("unreachable.action")}
          </Button>
        </div>
      )}
      {data.transferToUserId && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Send className="h-4 w-4 text-primary" />
          <span className="mr-auto">
            {t("transfer.pending", { name: data.transferToName ?? "…" })}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void cancel({ caseId: data._id }).then(
                () => toast.success(t("transfer.cancelled")),
                (e) => handleError(e, t("case.saveError")),
              )
            }
          >
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
            {t("transfer.cancel")}
          </Button>
        </div>
      )}
      {data.transferDeclined && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <UserRoundX className="h-4 w-4 text-warn" />
          <span className="mr-auto">
            {t("transfer.declinedBy", {
              name: data.transferDeclined.byName,
              reason: data.transferDeclined.reason,
            })}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void save({ dismissDecline: true })}>
            {t("transfer.dismiss")}
          </Button>
        </div>
      )}
    </>
  );
}
