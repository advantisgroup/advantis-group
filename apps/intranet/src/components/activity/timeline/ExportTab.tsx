"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useConvex } from "convex/react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { downloadFile, toCsv, toJson } from "@/lib/activity/export";
import { useI18n } from "@/lib/activity/i18n";

/**
 * Per-employee export tab: pick a date range, download the device's raw samples
 * as CSV or JSON. Self-contained — owns its range state and the convex query.
 */
export function ExportTab({
  deviceId,
  fileLabel,
  startDay,
  today,
}: {
  deviceId: string;
  fileLabel: string;
  startDay: string;
  today: string;
}) {
  const { t } = useI18n();
  const convex = useConvex();
  const [exportStart, setExportStart] = useState(startDay);
  const [exportEnd, setExportEnd] = useState(today);
  const [exporting, setExporting] = useState(false);

  async function runExport(format: "json" | "csv") {
    setExporting(true);
    try {
      const data = await convex.query(api.activity.stats.exportDevice, {
        deviceId,
        startDay: exportStart,
        endDay: exportEnd,
      });
      const base = `${fileLabel}_${exportStart}_${exportEnd}`.replace(/[^\w.-]+/g, "-");
      if (format === "json") {
        downloadFile(`${base}.json`, "application/json", toJson(data));
      } else {
        const rows = data.samples.map((s) => ({
          capturedAt: new Date(s.capturedAt).toISOString(),
          active: s.active,
          idleMs: s.idleMs,
          windowsUser: s.windowsUser,
          hostname: s.hostname,
        }));
        const csv = toCsv(rows, ["capturedAt", "active", "idleMs", "windowsUser", "hostname"]);
        downloadFile(`${base}.csv`, "text/csv;charset=utf-8", csv);
      }
      toast.success(t("timeline.export.done"));
    } catch (err) {
      // The query can fail (network/permissions); surface it instead of leaving
      // the user staring at a button that silently did nothing.
      toast.error(t("timeline.export.failed"));
      console.error("[export failed]", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="animate-fade-up max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">{t("timeline.export.heading")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("timeline.export.sub")}</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0 sm:pt-0">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
            {t("timeline.export.from")}
            <Input
              type="date"
              value={exportStart}
              max={exportEnd}
              onChange={(e) => setExportStart(e.target.value)}
              className="w-full sm:w-40"
            />
          </label>
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
            {t("timeline.export.to")}
            <Input
              type="date"
              value={exportEnd}
              min={exportStart}
              max={today}
              onChange={(e) => setExportEnd(e.target.value)}
              className="w-full sm:w-40"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void runExport("csv")} disabled={exporting}>
            <Download className="h-4 w-4" />
            {t("timeline.export.csv")}
          </Button>
          <Button variant="secondary" onClick={() => void runExport("json")} disabled={exporting}>
            <Download className="h-4 w-4" />
            {t("timeline.export.json")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
