"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type ScanReport, type ScanSeverity } from "@advantis/types";
import { useQuery } from "convex/react";
import { AlertTriangle, Check, FileText, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { formatFileSize } from "@/lib/upload";

type PendingUpload = NonNullable<
  ReturnType<typeof useQuery<typeof api.integrations.onedrive.listPending>>
>[number];

function parseReport(json: string): ScanReport | null {
  try {
    return JSON.parse(json) as ScanReport;
  } catch {
    return null;
  }
}

function verdictBadge(verdict: ScanReport["verdict"]) {
  if (verdict === "clean") return { variant: "success" as const, icon: ShieldCheck };
  if (verdict === "suspicious") return { variant: "warning" as const, icon: AlertTriangle };
  return { variant: "destructive" as const, icon: ShieldAlert };
}

const severityColor: Record<ScanSeverity, string> = {
  info: "text-muted-foreground",
  warning: "text-amber-500",
  danger: "text-destructive",
};

export function UploadApprovalQueue({
  readOnly = false,
}: {
  /** Hide the approve/deny actions — for viewers without write access. */
  readOnly?: boolean;
}) {
  const t = useTranslations("Admin");
  const pending = useQuery(api.integrations.onedrive.listPending);
  const [selected, setSelected] = useState<PendingUpload | null>(null);

  // Deep link from a notification: /admin/uploads?upload=<id> opens the
  // inspector dialog for that upload once the queue has loaded.
  const deepLinkUploadId = useDeepLinkId("upload");
  useEffect(() => {
    if (!deepLinkUploadId || !pending) return;
    const match = pending.find((u) => u._id === deepLinkUploadId);
    // One-shot sync from the deep-link id into local dialog state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setSelected(match);
  }, [deepLinkUploadId, pending]);

  if (pending === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pending.length === 0) {
    return <EmptyState inline title={t("noPendingUploads")} />;
  }

  return (
    <div className="space-y-2">
      {pending.map((upload) => {
        const report = parseReport(upload.scanReport);
        const badge = report ? verdictBadge(report.verdict) : null;
        return (
          <button
            key={upload._id}
            type="button"
            onClick={() => setSelected(upload)}
            className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-border"
          >
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{upload.fileName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {upload.requesterName} · {formatFileSize(upload.size)} ·{" "}
                {upload.targetFolderPath || "Advantis GmbH"}
              </p>
            </div>
            {badge && (
              <Badge variant={badge.variant} className="shrink-0">
                {t(`scan_${report!.verdict}`)}
              </Badge>
            )}
          </button>
        );
      })}

      <InspectorDialog upload={selected} onClose={() => setSelected(null)} readOnly={readOnly} />
    </div>
  );
}

function InspectorDialog({
  upload,
  onClose,
  readOnly,
}: {
  upload: PendingUpload | null;
  onClose: () => void;
  readOnly: boolean;
}) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const od = useOneDriveApi();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  const report = useMemo(() => (upload ? parseReport(upload.scanReport) : null), [upload]);
  const isImage = upload?.contentType.startsWith("image/") ?? false;
  const isPdf = upload?.contentType.includes("pdf") ?? false;

  const decide = async (kind: "approve" | "deny") => {
    if (!upload) return;
    setBusy(kind);
    try {
      const id = upload._id as Id<"onedriveUploads">;
      if (kind === "approve") await od.approve(id, note || undefined);
      else await od.deny(id, note || undefined);
      toast.success(kind === "approve" ? t("uploadApproved") : t("uploadDenied"));
      setNote("");
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={upload !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{upload?.fileName}</DialogTitle>
          <DialogDescription>
            {upload?.requesterName} → {upload?.targetFolderPath || "Advantis GmbH"}
          </DialogDescription>
        </DialogHeader>

        {upload && (
          <div className="space-y-4">
            {/* Metadata grid */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Meta label={t("metaSize")} value={formatFileSize(upload.size)} />
              <Meta label={t("metaType")} value={upload.contentType || "—"} />
              <Meta
                label={t("metaRequestedAt")}
                value={new Date(upload.createdAt).toLocaleString()}
              />
              <Meta label={t("metaTarget")} value={upload.targetFolderPath || "/"} />
            </dl>

            {/* Scan report */}
            {report && (
              <div className="rounded-lg border border-border/70 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium">{t("scanReport")}</span>
                  <Badge variant={verdictBadge(report.verdict).variant}>
                    {t(`scan_${report.verdict}`)}
                  </Badge>
                </div>
                {report.flags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("scanNoFlags")}</p>
                ) : (
                  <ul className="space-y-1">
                    {report.flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle
                          className={`mt-0.5 size-3.5 shrink-0 ${severityColor[f.severity]}`}
                        />
                        <span>{f.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Preview */}
            {(isImage || isPdf) && upload.previewUrl && (
              <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/40">
                {isImage ? (
                  <img
                    src={upload.previewUrl}
                    alt={upload.fileName}
                    className="max-h-72 w-full object-contain"
                  />
                ) : (
                  <iframe src={upload.previewUrl} title={upload.fileName} className="h-72 w-full" />
                )}
              </div>
            )}

            {!readOnly && (
              <>
                {/* Decision */}
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("decisionNotePlaceholder")}
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void decide("deny")}
                    disabled={busy !== null}
                  >
                    {busy === "deny" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <X className="size-4" />
                    )}
                    {t("deny")}
                  </Button>
                  <Button onClick={() => void decide("approve")} disabled={busy !== null}>
                    {busy === "approve" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {t("approve")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
