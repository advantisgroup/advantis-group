"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { berlinDate } from "@advantis/convex/time";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/zeiterfassung/parts";
import { type TimeEntry } from "@/components/zeiterfassung/use-days";
import { fromTimeInput, toTimeInput, useTimeErrorToast } from "@/lib/zeiterfassung";

/**
 * Add or change a booked segment. For an admin the change applies at once;
 * for everyone else it becomes a correction request, which the dialog says
 * up front.
 */
export function EntryDialog({
  open,
  onOpenChange,
  entry,
  defaultDate,
  userId,
  direct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimeEntry | null;
  defaultDate: string;
  userId?: Id<"users">;
  direct: boolean;
}) {
  const t = useTranslations("Zeiterfassung");
  const save = useMutation(api.time.entries.save);
  const showError = useTimeErrorToast();
  const [date, setDate] = useState(defaultDate);
  const [kind, setKind] = useState<"work" | "break">("work");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:30");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(entry ? berlinDate(entry.start) : defaultDate);
    setKind(entry?.kind ?? "work");
    setStart(entry ? toTimeInput(entry.start) : "08:00");
    setEnd(entry?.end ? toTimeInput(entry.end) : "16:30");
    setNote(entry?.note ?? "");
    setReason("");
  }, [open, entry, defaultDate]);

  const startMs = date ? fromTimeInput(date, start) : null;
  const endMs = date ? fromTimeInput(date, end) : null;
  const valid = startMs !== null && endMs !== null && endMs > startMs;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      const result = await save({
        userId,
        entryId: entry?._id,
        kind,
        start: startMs,
        end: endMs,
        note: note.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      toast.success(result.applied ? t("entries.saved") : t("entries.requested"));
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? t("entries.editTitle") : t("entries.addTitle")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || saving}>
            {direct ? t("common.save") : t("entries.sendRequest")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!direct && (
          <Alert>
            <AlertDescription>{t("entries.requestHint")}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="entry-date">{t("entries.date")}</FieldLabel>
            <Input
              id="entry-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel>{t("entries.kind")}</FieldLabel>
            <Select value={kind} onValueChange={(value) => setKind(value as "work" | "break")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work">{t("entries.kindWork")}</SelectItem>
                <SelectItem value="break">{t("entries.kindBreak")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="entry-start">{t("entries.start")}</FieldLabel>
            <Input
              id="entry-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="entry-end">{t("entries.end")}</FieldLabel>
            <Input
              id="entry-end"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
        </div>
        {startMs !== null && endMs !== null && endMs <= startMs && (
          <p className="text-xs text-destructive">{t("entries.endBeforeStart")}</p>
        )}
        <div>
          <FieldLabel htmlFor="entry-note">{t("entries.note")}</FieldLabel>
          <Input id="entry-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="entry-reason">
            {direct ? t("entries.reasonOptional") : t("entries.reason")}
          </FieldLabel>
          <Textarea
            id="entry-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("entries.reasonPlaceholder")}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function DeleteEntryDialog({
  entry,
  onOpenChange,
  direct,
}: {
  entry: TimeEntry | null;
  onOpenChange: (open: boolean) => void;
  direct: boolean;
}) {
  const t = useTranslations("Zeiterfassung");
  const remove = useMutation(api.time.entries.remove);
  const showError = useTimeErrorToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) setReason("");
  }, [entry]);

  async function submit() {
    if (!entry) return;
    setSaving(true);
    try {
      const result = await remove({ entryId: entry._id, reason: reason.trim() || undefined });
      toast.success(result.applied ? t("entries.deleted") : t("entries.requested"));
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={entry !== null}
      onOpenChange={onOpenChange}
      title={t("entries.deleteTitle")}
      description={direct ? t("entries.deleteHintDirect") : t("entries.deleteHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={saving}>
            {direct ? t("entries.delete") : t("entries.sendRequest")}
          </Button>
        </>
      }
    >
      <div>
        <FieldLabel htmlFor="delete-reason">
          {direct ? t("entries.reasonOptional") : t("entries.reason")}
        </FieldLabel>
        <Textarea
          id="delete-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ResponsiveDialog>
  );
}
