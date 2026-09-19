"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ArchiveRestore, CircleCheck, CloudUpload, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { FieldLabel, FormDialog } from "@/components/compose/FormDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { relativeTime } from "@/lib/format";

import { MetricRow, Panel, PanelSkeleton } from "./primitives";

const DAY_MS = 86_400_000;
/** A nightly job that hasn't landed in a day and a half has missed a night. */
const BACKUP_STALE_MS = 1.5 * DAY_MS;
/** Restore drills are quarterly; past this one is overdue. */
const RESTORE_TEST_DUE_MS = 100 * DAY_MS;

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

/**
 * The offsite backup (docs/backups.md) at a glance: did last night's run
 * land, how many recent nights did, and when someone last proved a backup can
 * actually be restored.
 */
export function BackupsPanel() {
  const t = useTranslations("Admin");
  const data = useQuery(api.org.backups.overview);
  const [logging, setLogging] = useState(false);
  const now = Date.now();

  const latest = data?.backups[0];
  const okNights = data?.backups.filter((b) => b.status === "ok").length ?? 0;
  const lastTest = data?.restoreTests[0];
  const backupOk = latest?.status === "ok" && now - latest.at < BACKUP_STALE_MS;
  const testOk = lastTest?.status === "ok" && now - lastTest.at < RESTORE_TEST_DUE_MS;

  return (
    <Panel
      icon={<CloudUpload />}
      title={t("overview.backups.title")}
      description={t("overview.backups.hint")}
      bodyClassName="p-3"
      action={
        <Button variant="outline" size="xs" onClick={() => setLogging(true)}>
          {t("overview.backups.logRestoreTest")}
        </Button>
      }
    >
      {data === undefined ? (
        <PanelSkeleton rows={2} />
      ) : (
        <div className="space-y-0.5">
          <MetricRow
            icon={!latest ? CloudUpload : backupOk ? CircleCheck : TriangleAlert}
            label={
              latest
                ? t(`overview.backups.last.${latest.status}`, { age: relativeTime(latest.at) })
                : t("overview.backups.none")
            }
            sublabel={
              latest
                ? [
                    latest.sizeBytes ? formatSize(latest.sizeBytes) : null,
                    t("overview.backups.nights", { ok: okNights, total: data.backups.length }),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : t("overview.backups.noneHint")
            }
            tone={!latest ? "neutral" : backupOk ? "ok" : "warn"}
          />
          <MetricRow
            icon={ArchiveRestore}
            label={
              lastTest
                ? t(`overview.backups.test.${lastTest.status}`, { age: relativeTime(lastTest.at) })
                : t("overview.backups.neverTested")
            }
            sublabel={
              lastTest
                ? [lastTest.by, lastTest.note].filter(Boolean).join(" · ") || null
                : t("overview.backups.neverTestedHint")
            }
            tone={testOk ? "ok" : "warn"}
          />
        </div>
      )}
      <RestoreTestDialog open={logging} onOpenChange={setLogging} />
    </Panel>
  );
}

function RestoreTestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin");
  const record = useMutation(api.org.backups.recordRestoreTest);
  const handleError = useErrorHandler();
  const [status, setStatus] = useState<"ok" | "failed">("ok");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await record({ status, note: note.trim() || undefined });
      toast.success(t("overview.backups.logged"));
      setNote("");
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("overview.backups.logRestoreTest")}
      description={t("overview.backups.logHint")}
      submitLabel={t("overview.backups.save")}
      onSubmit={() => void submit()}
      busy={busy}
    >
      <RadioGroup value={status} onValueChange={(value) => setStatus(value as "ok" | "failed")}>
        {(["ok", "failed"] as const).map((value) => (
          <Label key={value} className="flex items-center gap-2 text-sm font-normal">
            <RadioGroupItem value={value} />
            {t(`overview.backups.result.${value}`)}
          </Label>
        ))}
      </RadioGroup>
      <div className="space-y-1.5">
        <FieldLabel>{t("overview.backups.note")}</FieldLabel>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t("overview.backups.notePlaceholder")}
        />
      </div>
    </FormDialog>
  );
}
