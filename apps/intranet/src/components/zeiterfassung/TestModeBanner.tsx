"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { FlaskConical, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { useTimeErrorToast } from "@/lib/zeiterfassung";

/**
 * Shown on every Zeiterfassung page while Convex runs the module in test mode
 * (`TIME_MODE` not `live`): only testers get here, notifications go to them
 * instead of the admins, and they can wipe what they tried out.
 */
export function TestModeBanner() {
  const t = useTranslations("Zeiterfassung.testMode");
  const confirm = useConfirm();
  const purge = useMutation(api.time.mode.purgeTestData);
  const showError = useTimeErrorToast();
  const [busy, setBusy] = useState(false);

  async function wipe() {
    const ok = await confirm({
      title: t("purgeTitle"),
      description: t("purgeDescription"),
      confirmLabel: t("purgeConfirm"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      let deleted = 0;
      for (;;) {
        const result = await purge({ confirm: "TESTDATEN LÖSCHEN" });
        deleted += result.deleted;
        if (result.done) break;
      }
      toast.success(t("purged", { count: deleted }));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert>
      <FlaskConical className="size-4" />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("description")}</span>
        <Button variant="outline" size="sm" onClick={wipe} disabled={busy} className="shrink-0">
          <Trash2 className="size-4" />
          {t("purge")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
