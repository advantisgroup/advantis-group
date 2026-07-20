"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Loader2,
  RotateCw,
  Upload,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatIsoDate, relativeTime } from "@/lib/format";
import {
  clearPerformanceToken,
  downloadPerformanceFile,
  uploadPerformanceReport,
} from "@/lib/performanceAuth";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"];

type QueueStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "done"
  | "empty"
  | "duplicate"
  | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  rowsImported?: number;
  skipped?: string[];
  error?: string;
  duplicateOf?: { filename: string; uploadedAt: number };
  batchId?: string;
}

const REPORT_KIND_LABEL_KEY: Record<string, string> = {
  lead: "uploadKindLead",
  opp: "uploadKindOpp",
  call: "uploadKindCall",
  template: "uploadKindTemplate",
};

function FileIcon({ name }: { name: string }) {
  const isCsv = name.toLowerCase().endsWith(".csv");
  const Icon = isCsv ? FileText : FileSpreadsheet;
  return <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />;
}

function StatusIcon({ status }: { status: QueueStatus }) {
  switch (status) {
    case "queued":
      return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case "uploading":
    case "processing":
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
    case "done":
      return (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      );
    case "empty":
      return <Info className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case "duplicate":
      return (
        <Copy className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      );
    case "error":
      return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  }
}

interface UploadLogRow {
  _id: string;
  filename: string;
  rowsImported: number;
  uploadedAt: number;
  reportKind?: "lead" | "opp" | "call" | "template";
  reportDate?: string;
  sourceRowCount?: number;
  skippedNames?: string[];
  fileSize?: number;
  batchId?: string;
}

function LogRow({
  row,
  locale,
  token,
  indent,
}: {
  row: UploadLogRow;
  locale: string;
  token: string;
  indent?: boolean;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const reimportUpload = useAction(api.performanceUploadParse.reimportUpload);
  const [reimporting, setReimporting] = useState(false);
  // Predates this session's date-parsing fix (and the richer metadata added
  // alongside it) — worth a re-import even though we can't tell from stored
  // data alone whether this particular file was actually affected.
  const legacy = !row.reportKind;

  async function reimport() {
    setReimporting(true);
    try {
      const result = await reimportUpload({
        token,
        logId: row._id as Id<"performanceUploadLog">,
      });
      if (result.status === "ok") toast.success(t("uploadReimportOk"));
      else if (result.status === "empty") toast.info(t("uploadEmpty"));
    } catch (err) {
      handleError(err);
    } finally {
      setReimporting(false);
    }
  }

  return (
    <TableRow className={indent ? "bg-muted/30" : undefined}>
      <TableCell
        className={cn(
          "break-all",
          indent && "border-l-2 border-l-foreground/30 pl-6"
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {row.filename}
          {legacy && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              </TooltipTrigger>
              <TooltipContent>{t("uploadLogLegacy")}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </TableCell>
      <TableCell>
        {row.reportKind ? (
          <Badge variant="muted">
            {t(REPORT_KIND_LABEL_KEY[row.reportKind] ?? row.reportKind)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </TableCell>
      <TableCell>
        {row.reportDate ? formatIsoDate(row.reportDate, locale) : "–"}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          {row.sourceRowCount && row.sourceRowCount !== row.rowsImported
            ? t("uploadLogMatched", {
                matched: row.rowsImported,
                total: row.sourceRowCount,
              })
            : row.rowsImported}
          {row.skippedNames && row.skippedNames.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                {t("uploadSkipped", { names: row.skippedNames.join(", ") })}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      </TableCell>
      <TableCell>{row.fileSize ? formatFileSize(row.fileSize) : "–"}</TableCell>
      <TableCell title={relativeTime(row.uploadedAt)}>
        {formatDateTime(row.uploadedAt, locale)}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={t("uploadReimport")}
          disabled={reimporting}
          onClick={() => void reimport()}
        >
          {reimporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function BatchRows({
  batchId,
  rows,
  expanded,
  onToggle,
  locale,
  token,
}: {
  batchId: string;
  rows: UploadLogRow[];
  expanded: boolean;
  onToggle: () => void;
  locale: string;
  token: string;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const reimportBatch = useAction(api.performanceUploadParse.reimportBatch);
  const [reimporting, setReimporting] = useState(false);
  const totalRows = rows.reduce((sum, r) => sum + r.rowsImported, 0);
  const latest = rows[0].uploadedAt;

  async function reimportAll() {
    setReimporting(true);
    try {
      const { results } = await reimportBatch({ token, batchId });
      const ok = results.filter(r => r.status === "ok").length;
      toast.success(
        t("uploadReimportBatchOk", { count: ok, total: results.length })
      );
    } catch (err) {
      handleError(err);
    } finally {
      setReimporting(false);
    }
  }

  return (
    <>
      <TableRow className="hover:bg-muted/50">
        <TableCell colSpan={3} className="cursor-pointer" onClick={onToggle}>
          <span className="inline-flex items-center gap-2 font-medium">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {t("uploadLogBatch", { count: rows.length })}
          </span>
        </TableCell>
        <TableCell>{totalRows}</TableCell>
        <TableCell />
        <TableCell title={relativeTime(latest)}>
          {formatDateTime(latest, locale)}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t("uploadReimportBatch")}
            disabled={reimporting}
            onClick={() => void reimportAll()}
          >
            {reimporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </TableCell>
      </TableRow>
      {expanded &&
        rows.map(row => (
          <LogRow
            key={row._id}
            row={row}
            locale={locale}
            token={token}
            indent
          />
        ))}
    </>
  );
}

export default function PerformanceUploadPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const { token, session } = usePerformanceSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    // Wait for the query to resolve — a visitor with no password cookie may
    // still resolve via their linked Clerk identity.
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
      return;
    }
    if (session.role !== "admin") {
      router.replace("/performance");
      return;
    }
    // Uploads go through apps/api, which authenticates the bearer token
    // directly against a Performance session — it has no notion of the
    // caller's Clerk identity, so a Clerk-linked (passwordless) account
    // can't use this page.
    if (session.viaClerk) router.replace("/performance");
  }, [session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const log = useQuery(
    api.performanceImport.listUploadLog,
    isAdmin ? { token } : "skip"
  );

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function enqueue(files: File[]) {
    if (!token || files.length === 0) return;
    // Shared by every file dropped/picked together, so the upload log can
    // later show them as one batch — tagged even for a single file; the
    // log only renders batch chrome once a batchId actually repeats.
    const batchId = crypto.randomUUID();
    const items: QueueItem[] = files.map(file => {
      const accepted = ACCEPTED_EXTENSIONS.some(ext =>
        file.name.toLowerCase().endsWith(ext)
      );
      return {
        id: crypto.randomUUID(),
        file,
        status: accepted ? "queued" : "error",
        progress: 0,
        error: accepted ? undefined : t("uploadUnsupportedType"),
        batchId,
      };
    });
    setQueue(prev => [...items, ...prev]);

    for (const item of items) {
      if (item.status !== "queued") continue;
      await runUpload(item.id, item.file, { batchId: item.batchId });
    }
  }

  async function runUpload(
    id: string,
    file: File,
    opts?: { force?: boolean; batchId?: string }
  ) {
    if (!token) return;
    updateItem(id, { status: "uploading", progress: 0, error: undefined });
    const result = await uploadPerformanceReport(file, token, {
      onProgress: frac =>
        updateItem(id, {
          progress: frac,
          status: frac >= 1 ? "processing" : "uploading",
        }),
      force: opts?.force,
      batchId: opts?.batchId,
    });
    if (!result.ok) {
      updateItem(id, {
        status: "error",
        error: result.error ?? t("uploadFailed"),
      });
    } else if (result.status === "empty") {
      updateItem(id, { status: "empty" });
    } else if (result.status === "duplicate") {
      updateItem(id, {
        status: "duplicate",
        duplicateOf:
          result.filename && result.uploadedAt !== undefined
            ? { filename: result.filename, uploadedAt: result.uploadedAt }
            : undefined,
      });
    } else {
      updateItem(id, {
        status: "done",
        rowsImported: result.rowsImported,
        skipped: result.skipped,
      });
    }
  }

  function retryItem(id: string) {
    const item = queue.find(it => it.id === id);
    if (item) void runUpload(id, item.file, { batchId: item.batchId });
  }

  function forceItem(id: string) {
    const item = queue.find(it => it.id === id);
    if (item)
      void runUpload(id, item.file, { force: true, batchId: item.batchId });
  }

  function removeItem(id: string) {
    setQueue(prev => prev.filter(it => it.id !== id));
  }

  function clearFinished() {
    setQueue(prev =>
      prev.filter(it => it.status === "queued" || it.status === "uploading")
    );
  }

  const hasFinished = queue.some(it =>
    ["done", "empty", "duplicate", "error"].includes(it.status)
  );

  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
    new Set()
  );
  function toggleBatch(batchId: string) {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }
  const logGroups = useMemo(() => {
    if (!log) return [];
    type LogRow = (typeof log)[number];
    const byBatch = new Map<string, LogRow[]>();
    for (const row of log) {
      if (!row.batchId) continue;
      const arr = byBatch.get(row.batchId) ?? [];
      arr.push(row);
      byBatch.set(row.batchId, arr);
    }
    const groups: { key: string; rows: LogRow[]; batched: boolean }[] = [];
    const seen = new Set<string>();
    for (const row of log) {
      if (row.batchId && (byBatch.get(row.batchId)?.length ?? 0) > 1) {
        if (seen.has(row.batchId)) continue;
        seen.add(row.batchId);
        groups.push({
          key: row.batchId,
          rows: byBatch.get(row.batchId)!,
          batched: true,
        });
      } else {
        groups.push({ key: row._id, rows: [row], batched: false });
      }
    }
    return groups;
  }, [log]);

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid || session.role !== "admin" || session.viaClerk)
    return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader
        navItems={[{ href: "/performance", label: t("backToDashboard") }]}
        onExit={() => {
          clearPerformanceToken();
          router.replace("/performance/login");
        }}
      />

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {t("uploadTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("uploadIntro")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                token &&
                void downloadPerformanceFile(
                  "/performance/template",
                  token,
                  "performance-vorlage.xlsx"
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("templateDownload")}
            </Button>

            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragEnter={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={e => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length) {
                  void enqueue(Array.from(e.dataTransfer.files));
                }
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border/70 hover:border-border hover:bg-muted/30"
              )}
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t("uploadDropzoneTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("uploadDropzoneHint")}
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS.join(",")}
                className="hidden"
                onChange={e => {
                  if (e.target.files?.length) {
                    void enqueue(Array.from(e.target.files));
                  }
                  e.target.value = "";
                }}
              />
            </div>

            {queue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("uploadQueueTitle")}
                  </p>
                  {hasFinished && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={clearFinished}
                    >
                      {t("uploadClearFinished")}
                    </Button>
                  )}
                </div>
                <ul className="space-y-2">
                  {queue.map(item => (
                    <li
                      key={item.id}
                      className="rounded-md border border-border/70 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <FileIcon name={item.file.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {item.file.name}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatFileSize(item.file.size)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <StatusIcon status={item.status} />
                            {item.status === "queued" && (
                              <span className="text-muted-foreground">
                                {t("uploadStatusQueued")}
                              </span>
                            )}
                            {item.status === "uploading" && (
                              <span className="text-muted-foreground">
                                {t("uploadStatusUploading", {
                                  percent: Math.round(item.progress * 100),
                                })}
                              </span>
                            )}
                            {item.status === "processing" && (
                              <span className="text-muted-foreground">
                                {t("uploadStatusProcessing")}
                              </span>
                            )}
                            {item.status === "done" && (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {t("uploadOk", {
                                  count: item.rowsImported ?? 0,
                                })}
                              </span>
                            )}
                            {item.status === "empty" && (
                              <span className="text-muted-foreground">
                                {t("uploadEmpty")}
                              </span>
                            )}
                            {item.status === "duplicate" && (
                              <span className="text-amber-600 dark:text-amber-400">
                                {item.duplicateOf
                                  ? t("uploadDuplicateDetail", {
                                      filename: item.duplicateOf.filename,
                                      date: formatDateTime(
                                        item.duplicateOf.uploadedAt,
                                        locale
                                      ),
                                    })
                                  : t("uploadDuplicateStatus")}
                              </span>
                            )}
                            {item.status === "error" && (
                              <span className="text-destructive">
                                {item.error}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.status === "duplicate" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 shrink-0 px-2 text-xs"
                            onClick={() => forceItem(item.id)}
                          >
                            {t("uploadImportAnyway")}
                          </Button>
                        )}
                        {item.status === "error" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            title={t("uploadRetry")}
                            onClick={() => retryItem(item.id)}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(item.status === "queued" ||
                          item.status === "done" ||
                          item.status === "empty" ||
                          item.status === "duplicate" ||
                          item.status === "error") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => removeItem(item.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {item.status === "uploading" && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.round(item.progress * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                      {item.skipped && item.skipped.length > 0 && (
                        <p className="mt-1 pl-7 text-xs text-muted-foreground">
                          {t("uploadSkipped", {
                            names: item.skipped.join(", "),
                          })}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("uploadLogTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!log || log.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("uploadLogEmpty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("uploadLogFile")}</TableHead>
                    <TableHead>{t("uploadLogType")}</TableHead>
                    <TableHead>{t("uploadLogDate")}</TableHead>
                    <TableHead>{t("uploadLogRows")}</TableHead>
                    <TableHead>{t("uploadLogSize")}</TableHead>
                    <TableHead>{t("uploadLogWhen")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logGroups.map(group =>
                    group.batched ? (
                      <BatchRows
                        key={group.key}
                        batchId={group.key}
                        rows={group.rows}
                        expanded={expandedBatches.has(group.key)}
                        onToggle={() => toggleBatch(group.key)}
                        locale={locale}
                        token={token}
                      />
                    ) : (
                      <LogRow
                        key={group.key}
                        row={group.rows[0]}
                        locale={locale}
                        token={token}
                      />
                    )
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
