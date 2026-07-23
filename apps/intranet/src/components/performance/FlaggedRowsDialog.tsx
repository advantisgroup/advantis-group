"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { fmtDurationPrecise } from "@/components/performance/PerformanceFormat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

const FIELD_LABEL_KEY: Record<string, string> = {
  talkTotalSec: "callsTotalTalkLabel",
  talkAvgSec: "callsAvgDurationLabel",
  loginSec: "callsLoginLabel",
};

type FlaggedRow = {
  _id: string;
  employeeName: string;
  reportDate: string;
  field: string;
  rawSeconds: number;
  rawText: string;
  sourceFile: string;
  uploadedAt: number;
};

function FlaggedRowActions({ row, token }: { row: FlaggedRow; token: string }) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const resolve = useMutation(api.performanceImport.resolveFlaggedRow);
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    action: "ignore" | "force" | "edit",
    value?: number
  ): Promise<void> {
    setBusy(action);
    try {
      await resolve({
        token,
        id: row._id as Id<"performanceFlaggedRows">,
        action,
        value,
      });
      toast.success(t("flaggedResolved"));
      setEditing(false);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    const parsed = parseFloat(hours.replace(",", "."));
    const valid = Number.isFinite(parsed) && parsed >= 0;
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Input
          autoFocus
          value={hours}
          onChange={e => setHours(e.target.value)}
          placeholder={t("flaggedEditPlaceholder")}
          className="h-8 w-24 text-xs"
        />
        <Button
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={!valid || busy !== null}
          onClick={() => void run("edit", Math.round(parsed * 3600))}
        >
          {busy === "edit" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            t("flaggedSave")
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setEditing(false)}
          disabled={busy !== null}
        >
          {t("flaggedCancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs"
        disabled={busy !== null}
        onClick={() => setEditing(true)}
      >
        {t("flaggedEdit")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs"
        disabled={busy !== null}
        onClick={() => void run("ignore")}
      >
        {busy === "ignore" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          t("flaggedIgnore")
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2 text-xs"
        disabled={busy !== null}
        onClick={() => void run("force")}
      >
        {busy === "force" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          t("flaggedForceImport")
        )}
      </Button>
    </div>
  );
}

/** Banner + review dialog for call-report rows whose duration failed the
 * plausibility check on import (see `performanceFlaggedRows` in schema.ts).
 * Renders nothing once there's nothing pending. */
export function FlaggedRowsDialog({ token }: { token: string }) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const rows = useQuery(api.performanceImport.listFlaggedRows, { token });

  if (!rows || rows.length === 0) return null;

  return (
    <>
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>
          {t("flaggedBannerTitle", { count: rows.length })}
        </AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{t("flaggedBannerBody")}</span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-warning/40"
            onClick={() => setOpen(true)}
          >
            {t("flaggedReview")}
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {t("flaggedDialogTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("flaggedColEmployee")}</TableHead>
                  <TableHead>{t("flaggedColDate")}</TableHead>
                  <TableHead>{t("flaggedColField")}</TableHead>
                  <TableHead>{t("flaggedColValue")}</TableHead>
                  <TableHead>{t("flaggedColFile")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row._id} className="bg-warning/5">
                    <TableCell className="font-medium">
                      {row.employeeName}
                    </TableCell>
                    <TableCell>
                      {formatIsoDate(row.reportDate, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">
                        {t(FIELD_LABEL_KEY[row.field] ?? row.field)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs"
                      title={row.rawText}
                    >
                      {fmtDurationPrecise(row.rawSeconds)}
                    </TableCell>
                    <TableCell
                      className="max-w-[10rem] truncate text-xs text-muted-foreground"
                      title={row.sourceFile}
                    >
                      {row.sourceFile}
                    </TableCell>
                    <TableCell>
                      <FlaggedRowActions row={row} token={token} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
