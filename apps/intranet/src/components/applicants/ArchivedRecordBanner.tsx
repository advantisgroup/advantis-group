"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Archive, ArchiveRestore } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

const DAY_MS = 86_400_000;
/** Mirrors APPLICANT_RETENTION_DAYS in packages/convex/convex/hr/lib/retention.ts. */
const RETENTION_DAYS = 183;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Shown on an archived Akte: since when it sits in the archive, the day the
 * retention job deletes it, and the way back into the recruiting list.
 */
export function ArchivedRecordBanner({
  applicantId,
  archivedAt,
  poolConsentUntil,
}: {
  applicantId: Id<"applicants">;
  archivedAt: number;
  poolConsentUntil?: number;
}) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const restore = useMutation(api.hr.archive.restore);
  const handleError = useErrorHandler();
  const deletesAt = Math.max(archivedAt + RETENTION_DAYS * DAY_MS, poolConsentUntil ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border/70 bg-muted/50 px-5 py-3 text-sm">
      <Archive className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        {t("archiveBanner", {
          archived: formatIsoDate(isoDay(archivedAt), locale),
          deletes: formatIsoDate(isoDay(deletesAt), locale),
        })}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          void restore({ applicantId })
            .then(() => toast.success(t("archiveRestoredSelf")))
            .catch(handleError)
        }
      >
        <ArchiveRestore className="size-4" />
        {t("archiveRestore")}
      </Button>
    </div>
  );
}
