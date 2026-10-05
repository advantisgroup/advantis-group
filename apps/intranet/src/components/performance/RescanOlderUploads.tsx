"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, SearchCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { rescanCallReport } from "@/lib/performanceRescan";

const ALL_BATCHES = "__all__";

/**
 * Call reports uploaded before the implausible-duration check existed (or
 * before this rescan feature did) never got a chance to raise flags a fresh
 * upload would today. Lets an admin pick exactly which ones to re-check —
 * one file, everything from one batch, a report-date range, or an arbitrary
 * multi-select — then re-downloads just those straight from Convex storage
 * and re-parses them in the browser (see `performanceRescan.ts`) instead of
 * spending a Convex action re-checking old history. Only the (typically
 * empty) set of findings gets written back via `recordScanResults`.
 * Renders nothing once there's nothing left to check.
 */
export function RescanOlderUploads({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const unscanned = useQuery(api.performance.import.listUnscannedCallUploads, { companyId });
  const employeeNames = useQuery(api.performance.import.listEmployeeNames, { companyId });
  const recordScanResults = useMutation(api.performance.import.recordScanResults);

  const [open, setOpen] = useState(false);
  const [batchFilter, setBatchFilter] = useState(ALL_BATCHES);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const batches = useMemo(() => {
    if (!unscanned) return [];
    return [...new Set(unscanned.map((r) => r.batchId).filter((b): b is string => !!b))];
  }, [unscanned]);

  const filtered = useMemo(() => {
    if (!unscanned) return [];
    return unscanned.filter((r) => {
      if (batchFilter !== ALL_BATCHES && r.batchId !== batchFilter) return false;
      if (dateFrom && (!r.reportDate || r.reportDate < dateFrom)) return false;
      if (dateTo && (!r.reportDate || r.reportDate > dateTo)) return false;
      return true;
    });
  }, [unscanned, batchFilter, dateFrom, dateTo]);

  if (!unscanned || unscanned.length === 0) return null;

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r._id));

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filtered) next.delete(r._id);
      } else {
        for (const r of filtered) next.add(r._id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function scanSelected() {
    if (!unscanned || !employeeNames || selected.size === 0) return;
    const targets = unscanned.filter((r) => selected.has(r._id));
    setProgress({ done: 0, total: targets.length });
    let flaggedTotal = 0;
    for (let i = 0; i < targets.length; i++) {
      const log = targets[i];
      try {
        const { flaggedRows } = await rescanCallReport(log.filename, log.fileUrl, employeeNames);
        await recordScanResults({
          logId: log._id,
          flaggedRows,
        });
        flaggedTotal += flaggedRows.length;
      } catch (err) {
        handleError(err, t("rescanFileFailed", { filename: log.filename }));
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setProgress(null);
    setSelected(new Set());
    toast.success(
      flaggedTotal > 0 ? t("rescanDoneFound", { count: flaggedTotal }) : t("rescanDoneClean"),
    );
  }

  return (
    <>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SearchCheck className="h-4 w-4 shrink-0" />
            {t("rescanBannerBody", { count: unscanned.length })}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setOpen(true)}
          >
            {t("rescanReview")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SearchCheck className="h-4 w-4 text-muted-foreground" />
              {t("rescanDialogTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="h-8 w-auto min-w-[10rem] text-xs">
                <SelectValue placeholder={t("rescanFilterBatch")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BATCHES}>{t("rescanFilterAllBatches")}</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {t("rescanFilterBatchOf", {
                      count: unscanned.filter((r) => r.batchId === b).length,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-auto text-xs"
              title={t("rescanFilterDateFrom")}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-auto text-xs"
              title={t("rescanFilterDateTo")}
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto overflow-x-auto rounded-md border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAllFiltered}
                      aria-label={t("rescanSelectAll")}
                    />
                  </TableHead>
                  <TableHead>{t("uploadLogFile")}</TableHead>
                  <TableHead>{t("uploadLogDate")}</TableHead>
                  <TableHead>{t("uploadLogWhen")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell className="w-0">
                      <Checkbox
                        checked={selected.has(row._id)}
                        onCheckedChange={() => toggleOne(row._id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={row.filename}>
                      {row.filename}
                      {row.batchId && (
                        <Badge variant="muted" className="ml-1.5 align-middle">
                          {t("rescanBatchTag")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.reportDate ? formatIsoDate(row.reportDate, locale) : "–"}
                    </TableCell>
                    <TableCell>{formatDateTime(row.uploadedAt, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <span className="mr-auto text-xs text-muted-foreground">
              {t("rescanSelectedCount", { count: selected.size })}
            </span>
            <Button
              disabled={selected.size === 0 || progress !== null || !employeeNames}
              onClick={() => void scanSelected()}
            >
              {progress ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {t("rescanProgress", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </>
              ) : (
                t("rescanStart")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
