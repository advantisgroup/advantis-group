"use client";

import { useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { addDays, bavarianHolidays, berlinDate, weekdayOf } from "@advantis/convex/time";
import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
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
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FlaggedRowsDialog } from "@/components/performance/FlaggedRowsDialog";
import { type PerformanceDashboardKind } from "@/components/performance/PerformanceAccess";
import { PerformanceShell, usePerformanceGate } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { RescanOlderUploads } from "@/components/performance/RescanOlderUploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatIsoDate, relativeTime } from "@/lib/format";
import {
  MAX_REPORT_UPLOAD_BYTES,
  type PerformanceReportKind,
  usePerformanceApi,
} from "@/lib/performance";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"];

type QueueStatus = "queued" | "uploading" | "processing" | "done" | "empty" | "duplicate" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  rowsImported?: number;
  skipped?: string[];
  flaggedCount?: number;
  error?: string;
  duplicateOf?: { filename: string; uploadedAt: number };
  batchId?: string;
  reportKind?: PerformanceReportKind;
  reportDate?: string;
  reportDateFrom?: string;
  rawKept?: string;
  alsoImportedInto?: string[];
  notImportedInto?: string[];
}

const REPORT_KIND_LABEL_KEY: Record<string, string> = {
  lead: "uploadKindLead",
  opp: "uploadKindOpp",
  call: "uploadKindCall",
  template: "uploadKindTemplate",
  interactions: "uploadKindInteractions",
  wallbox_members: "uploadKindWallboxMembers",
  wallbox_opps: "uploadKindWallboxOpps",
};

type DailyKind = "lead" | "opp" | "wallbox_members" | "wallbox_opps" | "call" | "interactions";

/** The reports a dashboard expects every workday; optional ones are shown
 * but never reported as missing. */
const DAILY_KINDS: Record<PerformanceDashboardKind, { kind: DailyKind; optional?: boolean }[]> = {
  sales: [{ kind: "lead" }, { kind: "opp" }, { kind: "call" }, { kind: "interactions" }],
  wallbox: [
    { kind: "wallbox_members" },
    { kind: "wallbox_opps" },
    { kind: "call" },
    { kind: "interactions", optional: true },
  ],
  calls: [{ kind: "call" }, { kind: "interactions", optional: true }],
};
const STATUS_WORKDAYS = 7;

/** Salesforce exports create the names the call and interaction reports
 * are matched against, and the Wallbox opp report the full names the
 * campaign report's first names resolve to — so those go first when several
 * files are dropped at once. Only the filename is looked at — the server
 * detects the real kind from the content either way. */
function uploadOrder(file: File): number {
  const name = file.name.toLowerCase();
  if (name.includes("wallbox")) return /opp/.test(name) ? 0 : 1;
  if (/lead|opp|salesforce|verkaufschance/.test(name)) return 0;
  if (/interakt|interaction/.test(name)) return 3;
  return 2;
}

/** The last `count` Mon–Fri days that aren't Nürnberg holidays, oldest
 * first, ending today (Berlin). */
function recentWorkdays(count: number): string[] {
  const out: string[] = [];
  const holidaysByYear = new Map<number, Set<string>>();
  const isHoliday = (date: string) => {
    const year = Number(date.slice(0, 4));
    let set = holidaysByYear.get(year);
    if (!set) {
      set = new Set(
        bavarianHolidays(year)
          .filter((h) => h.fraction >= 1)
          .map((h) => h.date),
      );
      holidaysByYear.set(year, set);
    }
    return set.has(date);
  };
  for (let date = berlinDate(Date.now()); out.length < count; date = addDays(date, -1)) {
    if (weekdayOf(date) < 5 && !isHoliday(date)) out.push(date);
  }
  return out.reverse();
}

function formatReportDays(from: string | undefined, to: string, locale: string): string {
  return from && from !== to
    ? `${formatIsoDate(from, locale)} – ${formatIsoDate(to, locale)}`
    : formatIsoDate(to, locale);
}

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
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />;
    case "empty":
      return <Info className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case "duplicate":
      return <Copy className="h-4 w-4 shrink-0 text-warn" />;
    case "error":
      return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  }
}

/** Unmatched report names, spelled out (not hidden in a tooltip) with the
 * place to fix them. */
function SkippedNames({ names, className }: { names: string[]; className?: string }) {
  const t = useTranslations("Performance");
  const [open, setOpen] = useState(false);
  if (names.length === 0) return null;
  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 font-medium text-warn hover:underline"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {t("uploadSkippedShow", { count: names.length })}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-4">
          <p className="break-words">{names.join(", ")}</p>
          <p>
            {t("uploadSkippedHint")}{" "}
            <Link href="/performance/einstellungen" className="font-medium underline">
              {t("uploadSettingsLink")}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

interface UploadLogRow {
  _id: string;
  filename: string;
  rowsImported: number;
  uploadedAt: number;
  reportKind?: PerformanceReportKind;
  reportDate?: string;
  reportDateFrom?: string;
  sourceRowCount?: number;
  skippedNames?: string[];
  fileSize?: number;
  batchId?: string;
  uploadedBy?: string;
}

function LogRow({
  row,
  locale,
  companyId,
  indent,
}: {
  row: UploadLogRow;
  locale: string;
  companyId: Id<"companies">;
  indent?: boolean;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const reimportUpload = useAction(api.performance.uploadParse.reimportUpload);
  const [reimporting, setReimporting] = useState(false);
  // Predates this session's date-parsing fix (and the richer metadata added
  // alongside it) — worth a re-import even though we can't tell from stored
  // data alone whether this particular file was actually affected.
  const legacy = !row.reportKind;

  async function reimport() {
    setReimporting(true);
    try {
      const result = await reimportUpload({
        companyId,
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
        className={cn("max-w-[20rem]", indent && "border-l-2 border-l-foreground/30 pl-6")}
      >
        <span className="flex min-w-0 items-center gap-1.5" title={row.filename}>
          <span className="truncate">{row.filename}</span>
          {legacy && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warn" />
              </TooltipTrigger>
              <TooltipContent>{t("uploadLogLegacy")}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(row._id);
            toast.success(t("uploadIdCopied"));
          }}
          title={`${t("uploadCopyId")}: ${row._id}`}
          className="mt-0.5 flex min-w-0 max-w-full items-center gap-1 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground"
        >
          <Copy className="h-3 w-3 shrink-0" />
          <span className="truncate">{row._id}</span>
        </button>
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
      <TableCell className="whitespace-nowrap">
        {row.reportDate ? formatReportDays(row.reportDateFrom, row.reportDate, locale) : "–"}
      </TableCell>
      <TableCell className="max-w-[18rem]">
        {row.sourceRowCount && row.sourceRowCount !== row.rowsImported
          ? t("uploadLogMatched", {
              matched: row.rowsImported,
              total: row.sourceRowCount,
            })
          : row.rowsImported}
        <SkippedNames names={row.skippedNames ?? []} className="mt-0.5" />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {row.fileSize ? formatFileSize(row.fileSize) : "–"}
      </TableCell>
      <TableCell title={relativeTime(row.uploadedAt)}>
        {formatDateTime(row.uploadedAt, locale)}
      </TableCell>
      <TableCell className="hidden max-w-[10rem] truncate md:table-cell" title={row.uploadedBy}>
        {row.uploadedBy ?? <span className="text-muted-foreground">–</span>}
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
  companyId,
}: {
  batchId: string;
  rows: UploadLogRow[];
  expanded: boolean;
  onToggle: () => void;
  locale: string;
  companyId: Id<"companies">;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const reimportBatch = useAction(api.performance.uploadParse.reimportBatch);
  const [reimporting, setReimporting] = useState(false);
  const totalRows = rows.reduce((sum, r) => sum + r.rowsImported, 0);
  const latest = rows[0].uploadedAt;

  async function reimportAll() {
    setReimporting(true);
    try {
      const { results } = await reimportBatch({ companyId, batchId });
      const ok = results.filter((r) => r.status === "ok").length;
      toast.success(t("uploadReimportBatchOk", { count: ok, total: results.length }));
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
        <TableCell className="hidden md:table-cell" />
        <TableCell title={relativeTime(latest)}>{formatDateTime(latest, locale)}</TableCell>
        <TableCell
          className="hidden max-w-[10rem] truncate md:table-cell"
          title={rows[0].uploadedBy}
        >
          {rows[0].uploadedBy ?? <span className="text-muted-foreground">–</span>}
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
        rows.map((row) => (
          <LogRow key={row._id} row={row} locale={locale} companyId={companyId} indent />
        ))}
    </>
  );
}

/** "Tagesstatus": which of the dashboard's daily exports are in for each of
 * the last workdays, so the admin sees at a glance what's still missing. */
function DailyStatus({
  companyId,
  dashboardKind,
}: {
  companyId: Id<"companies">;
  dashboardKind: PerformanceDashboardKind;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  // Recomputed per render on purpose: cheap, and it rolls over at midnight.
  const days = recentWorkdays(STATUS_WORKDAYS);
  const status = useQuery(api.performance.import.dailyUploadStatus, { companyId, dates: days });
  if (!status) return null;

  const today = berlinDate(Date.now());
  const kindLabel = (k: string) => t(REPORT_KIND_LABEL_KEY[k] ?? k);
  const expected = DAILY_KINDS[dashboardKind];
  const latest = status[status.length - 1];
  const missing = latest
    ? expected.filter((k) => !k.optional && !latest.kinds.includes(k.kind)).map((k) => k.kind)
    : [];
  const summary =
    missing.length === 0
      ? latest?.date === today
        ? t("dailyStatusCompleteToday")
        : null
      : latest?.date === today
        ? t("dailyStatusMissingToday", { kinds: missing.map(kindLabel).join(", ") })
        : t("dailyStatusMissingLatest", {
            date: formatIsoDate(latest.date, locale),
            kinds: missing.map(kindLabel).join(", "),
          });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium">{t("dailyStatusTitle")}</h2>
          {summary && (
            <p
              className={cn("text-xs font-medium", missing.length === 0 ? "text-ok" : "text-warn")}
            >
              {summary}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("dailyStatusHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pr-2 text-left font-normal" />
                {status.map((d) => (
                  <th key={d.date} className="px-1 py-1 text-center font-normal">
                    {d.date === today
                      ? t("dailyStatusToday")
                      : new Date(`${d.date}T12:00:00Z`).toLocaleDateString(locale, {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expected.map(({ kind, optional }) => (
                <tr key={kind} className="border-t border-border/50">
                  <td className="py-1.5 pr-2 font-medium">
                    {kindLabel(kind)}
                    {optional && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({t("dailyStatusOptional")})
                      </span>
                    )}
                  </td>
                  {status.map((d) => {
                    const has = d.kinds.includes(kind);
                    return (
                      <td key={d.date} className="px-1 py-1.5 text-center">
                        {has ? (
                          <CheckCircle2
                            className="mx-auto h-4 w-4 text-ok"
                            aria-label={t("dailyStatusPresent")}
                          />
                        ) : (
                          <span
                            className="mx-auto block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                            aria-label={t("dailyStatusMissing")}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const LOG_PAGE = 60;

export default function PerformanceUploadPage() {
  const t = useTranslations("Performance");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const { loading, me, dashboard } = usePerformanceGate((m) => m.isAdmin);
  const companyId = dashboard?.companyId;
  const performanceApi = usePerformanceApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [flaggedDialogOpen, setFlaggedDialogOpen] = useState(false);

  const [logLimit, setLogLimit] = useState(LOG_PAGE);
  const logPage = useQuery(
    api.performance.import.listUploadLog,
    me && companyId ? { companyId, limit: logLimit } : "skip",
  );
  // Keeps the previous page on screen while "Mehr laden" fetches the next.
  const lastLogPage = useRef(logPage);
  if (logPage !== undefined) lastLogPage.current = logPage;
  const shownLog = logPage ?? lastLogPage.current;
  const log = shownLog?.rows;

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function enqueue(files: File[]) {
    if (!companyId || files.length === 0) return;
    // Shared by every file dropped/picked together, so the upload log can
    // later show them as one batch — tagged even for a single file; the
    // log only renders batch chrome once a batchId actually repeats.
    const batchId = crypto.randomUUID();
    const sorted = [...files].sort((a, b) => uploadOrder(a) - uploadOrder(b));
    const items: QueueItem[] = sorted.map((file) => {
      const accepted = ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
      const tooLarge = accepted && file.size > MAX_REPORT_UPLOAD_BYTES;
      return {
        id: crypto.randomUUID(),
        file,
        status: accepted && !tooLarge ? "queued" : "error",
        progress: 0,
        error: !accepted ? t("uploadUnsupportedType") : tooLarge ? t("uploadTooLarge") : undefined,
        batchId,
      };
    });
    setQueue((prev) => [...items, ...prev]);

    for (const item of items) {
      if (item.status !== "queued") continue;
      await runUpload(item.id, item.file, { batchId: item.batchId });
    }
  }

  async function runUpload(id: string, file: File, opts?: { force?: boolean; batchId?: string }) {
    if (!companyId) return;
    updateItem(id, { status: "uploading", progress: 0, error: undefined });
    const result = await performanceApi.uploadReport(file, {
      companyId,
      onProgress: (frac) =>
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
      updateItem(id, {
        status: "empty",
        reportKind: result.reportKind,
        reportDate: result.reportDate,
      });
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
        flaggedCount: result.flagged,
        reportKind: result.reportKind,
        reportDate: result.reportDate,
        reportDateFrom: result.reportDateFrom,
        rawKept: result.rawKept,
        alsoImportedInto: result.alsoImportedInto,
        notImportedInto: result.notImportedInto,
      });
      // The plausibility check runs silently during import — without this,
      // an admin watching the queue sees a plain green "done" and has no
      // reason to notice the (easy to miss, above-the-fold) review banner
      // that just appeared, let alone that it's this file's own doing.
      if (result.flagged) {
        toast.warning(t("uploadFlaggedToast", { count: result.flagged, filename: file.name }), {
          action: { label: t("flaggedReview"), onClick: () => setFlaggedDialogOpen(true) },
        });
      }
    }
  }

  function retryItem(id: string) {
    const item = queue.find((it) => it.id === id);
    if (item) void runUpload(id, item.file, { batchId: item.batchId });
  }

  function forceItem(id: string) {
    const item = queue.find((it) => it.id === id);
    if (item) void runUpload(id, item.file, { force: true, batchId: item.batchId });
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((it) => it.id !== id));
  }

  function clearFinished() {
    setQueue((prev) => prev.filter((it) => it.status === "queued" || it.status === "uploading"));
  }

  const hasFinished = queue.some((it) =>
    ["done", "empty", "duplicate", "error"].includes(it.status),
  );

  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => {
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

  if (loading) return <PerformancePageSkeleton />;
  if (!me || !companyId || !dashboard) return null;
  const kind = dashboard.kind;

  return (
    <PerformanceShell
      title={t("uploadTitleFor", { dashboard: dashboard.name })}
      description={t(
        kind === "wallbox"
          ? "uploadIntroWallbox"
          : kind === "calls"
            ? "uploadIntroCalls"
            : "uploadIntro",
      )}
      width="max-w-7xl"
      actions={
        kind === "sales" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void performanceApi.download("/performance/template", "performance-vorlage.xlsx")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {t("templateDownload")}
          </Button>
        )
      }
    >
      <FlaggedRowsDialog
        companyId={companyId}
        open={flaggedDialogOpen}
        onOpenChange={setFlaggedDialogOpen}
      />
      <DailyStatus companyId={companyId} dashboardKind={kind} />
      <RescanOlderUploads companyId={companyId} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={(e) => {
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
                : "border-border/70 hover:border-border hover:bg-muted/30",
            )}
          >
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t("uploadDropzoneTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("uploadDropzoneHint")}</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
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
              {queue.length > 1 && kind !== "calls" && (
                <p className="text-xs text-muted-foreground">
                  {t(kind === "wallbox" ? "uploadSortedHintWallbox" : "uploadSortedHint")}
                </p>
              )}
              <ul className="space-y-2">
                {queue.map((item) => (
                  <li key={item.id} className="rounded-md border border-border/70 p-3">
                    <div className="flex items-center gap-2">
                      <FileIcon name={item.file.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{item.file.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatFileSize(item.file.size)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                          <StatusIcon status={item.status} />
                          {item.status === "queued" && (
                            <span className="text-muted-foreground">{t("uploadStatusQueued")}</span>
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
                            <span className="text-ok">
                              {t("uploadOk", {
                                count: item.rowsImported ?? 0,
                              })}
                            </span>
                          )}
                          {item.status === "done" && !!item.flaggedCount && (
                            <button
                              type="button"
                              onClick={() => setFlaggedDialogOpen(true)}
                              className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning hover:bg-warning/25"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {t("uploadFlaggedInline", { count: item.flaggedCount })}
                            </button>
                          )}
                          {item.status === "empty" && (
                            <span className="text-muted-foreground">{t("uploadEmpty")}</span>
                          )}
                          {item.status === "duplicate" && (
                            <span className="text-warn">
                              {item.duplicateOf
                                ? t("uploadDuplicateDetail", {
                                    filename: item.duplicateOf.filename,
                                    date: formatDateTime(item.duplicateOf.uploadedAt, locale),
                                  })
                                : t("uploadDuplicateStatus")}
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="text-destructive">{item.error}</span>
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
                          aria-label={tc("remove")}
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
                    {item.reportKind && item.reportDate && (
                      <p className="mt-1 pl-7 text-xs text-muted-foreground">
                        {t("uploadKindDetected", {
                          kind: t(REPORT_KIND_LABEL_KEY[item.reportKind] ?? item.reportKind),
                          date: formatReportDays(item.reportDateFrom, item.reportDate, locale),
                        })}
                      </p>
                    )}
                    {!!item.alsoImportedInto?.length && (
                      <p className="mt-1 pl-7 text-xs text-muted-foreground">
                        {t("uploadAlsoImported", { dashboards: item.alsoImportedInto.join(", ") })}
                      </p>
                    )}
                    {!!item.notImportedInto?.length && (
                      <p className="mt-1 pl-7 text-xs text-warning">
                        {t("uploadNotImported", { dashboards: item.notImportedInto.join(", ") })}
                      </p>
                    )}
                    {item.rawKept && (
                      <p className="mt-1 pl-7 text-xs text-muted-foreground">
                        {t("uploadRawKept", { date: formatIsoDate(item.rawKept, locale) })}
                      </p>
                    )}
                    {item.skipped && <SkippedNames names={item.skipped} className="mt-1 pl-7" />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("uploadLogTitle")}</h2>
        <Card>
          {log === undefined ? null : log.length === 0 ? (
            <EmptyState inline title={t("uploadLogEmpty")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("uploadLogFile")}</TableHead>
                  <TableHead>{t("uploadLogType")}</TableHead>
                  <TableHead>{t("uploadLogDate")}</TableHead>
                  <TableHead>{t("uploadLogRows")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("uploadLogSize")}</TableHead>
                  <TableHead>{t("uploadLogWhen")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("uploadLogBy")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logGroups.map((group) =>
                  group.batched ? (
                    <BatchRows
                      key={group.key}
                      batchId={group.key}
                      rows={group.rows}
                      expanded={expandedBatches.has(group.key)}
                      onToggle={() => toggleBatch(group.key)}
                      locale={locale}
                      companyId={companyId}
                    />
                  ) : (
                    <LogRow
                      key={group.key}
                      row={group.rows[0]}
                      locale={locale}
                      companyId={companyId}
                    />
                  ),
                )}
              </TableBody>
            </Table>
          )}
        </Card>
        {shownLog?.hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={logPage === undefined}
              onClick={() => setLogLimit((n) => n + LOG_PAGE)}
            >
              {logPage === undefined && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t("uploadLogMore")}
            </Button>
          </div>
        )}
      </section>
    </PerformanceShell>
  );
}
