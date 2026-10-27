"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { decodeCsvBytes } from "@advantis/convex/performance/callImport";
import {
  type ColumnMap,
  REPORT_COLUMNS,
  customerKey,
  findHeaderRow,
  guessColumns,
  reportRows,
} from "@advantis/convex/performance/onboarding";
import { normalizeZipLocalHeaders } from "@advantis/convex/performance/xlsxZip";
import { useMutation, useQuery } from "convex/react";
import { FileSpreadsheet, Flag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { formatDateTime } from "@/lib/format";

const CHUNK = 200;
const NONE = "-1";

interface Sheet {
  fileName: string;
  headers: string[];
  rows: unknown[][];
}

/** Reads the first sheet of an .xlsx/.xls/.csv in the browser. */
async function readSheet(file: File): Promise<Sheet> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = file.name.toLowerCase().endsWith(".csv")
    ? XLSX.read(decodeCsvBytes(bytes), { type: "string", cellDates: true, raw: true })
    : (normalizeZipLocalHeaders(bytes), XLSX.read(bytes, { type: "array", cellDates: true }));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  const h = findHeaderRow(all);
  const headers = (all[h] ?? []).map((x, i) => String(x ?? "").trim() || `Spalte ${i + 1}`);
  return { fileName: file.name, headers, rows: all.slice(h + 1) };
}

function cell(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString("de-DE");
  return String(value ?? "");
}

/** Report and prio-list upload for admins, plus the last imports. */
export function ImportPanel() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportImport />
        <PrioImport />
      </div>
      <ImportHistory />
    </div>
  );
}

function FilePick({ onSheet }: { onSheet: (sheet: Sheet | null) => void }) {
  const t = useTranslations("OnboardingCockpit");
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const sheet = await readSheet(file);
            setName(file.name);
            onSheet(sheet);
          } catch {
            setName(null);
            onSheet(null);
            toast.error(t("import.readError"));
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        {t("import.choose")}
      </Button>
      {name && <span className="truncate text-sm text-muted-foreground">{name}</span>}
    </div>
  );
}

function ColumnSelect({
  label,
  headers,
  value,
  onChange,
  optional,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (index: number) => void;
  optional: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(optional || value < 0) && <SelectItem value={NONE}>{t("import.none")}</SelectItem>}
          {headers.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ReportImport() {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const start = useMutation(api.performance.onboarding.importStart);
  const chunk = useMutation(api.performance.onboarding.importReportChunk);
  const finish = useMutation(api.performance.onboarding.importFinish);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const parsed = sheet && map ? reportRows(sheet.headers, sheet.rows, map) : null;

  const run = async () => {
    if (!sheet || !map || !parsed) return;
    if (map.number < 0) {
      toast.error(t("import.noNumberColumn"));
      return;
    }
    const total = parsed.rows.length;
    setProgress({ done: 0, total });
    try {
      const importId = await start({ kind: "report", fileName: sheet.fileName });
      for (let i = 0; i < total; i += CHUNK) {
        // Customer names stay out of the intranet (Vahan, 27.10.): the name
        // column is recognised so it isn't kept as a report field, but never sent.
        const rows = parsed.rows.slice(i, i + CHUNK).map(({ name: _name, ...rest }) => rest);
        await chunk({ importId, rows });
        setProgress({ done: Math.min(i + CHUNK, total), total });
      }
      const result = await finish({ importId });
      toast.success(t("import.reportDone", result));
      setSheet(null);
      setMap(null);
    } catch (e) {
      handleError(e, t("import.error"));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          {t("import.reportTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("import.reportHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilePick
          onSheet={(s) => {
            setSheet(s);
            setMap(s ? guessColumns(s.headers) : null);
          }}
        />
        {sheet && map && parsed && (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("import.mapping")} ·{" "}
                <span className="font-normal text-muted-foreground">
                  {t("import.rows", { count: parsed.rows.length })}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{t("import.mappingHint")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {REPORT_COLUMNS.filter((key) => key !== "name").map((key) => (
                  <ColumnSelect
                    key={key}
                    label={t(`import.field.${key}`)}
                    headers={sheet.headers}
                    value={map[key]}
                    optional={key !== "number"}
                    onChange={(index) => setMap({ ...map, [key]: index })}
                  />
                ))}
              </div>
              {(parsed.skipped > 0 || parsed.duplicates > 0) && (
                <p className="text-xs text-warn">
                  {t("import.skipped", {
                    skipped: parsed.skipped,
                    duplicates: parsed.duplicates,
                  })}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("import.preview")}</p>
              <div className="max-h-56 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sheet.headers.map((h, i) => (
                        <TableHead key={i} className="whitespace-nowrap text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheet.rows.slice(0, 4).map((r, ri) => (
                      <TableRow key={ri}>
                        {sheet.headers.map((_, i) => (
                          <TableCell key={i} className="whitespace-nowrap text-xs">
                            {cell(r[i])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <Button
              onClick={() => void run()}
              disabled={!!progress || parsed.rows.length === 0 || map.number < 0}
            >
              {progress ? t("import.running", progress) : t("import.start")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PrioImport() {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const start = useMutation(api.performance.onboarding.importStart);
  const chunk = useMutation(api.performance.onboarding.importPrioChunk);
  const finish = useMutation(api.performance.onboarding.importFinish);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [column, setColumn] = useState(0);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const numbers = sheet
    ? [
        ...new Set(
          sheet.rows
            .map((r) => String(r[column] ?? "").trim())
            .filter((n) => customerKey(n) !== ""),
        ),
      ]
    : [];

  const run = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const importId = await start({ kind: "prio", fileName: sheet.fileName, resetPrio: reset });
      for (let i = 0; i < numbers.length; i += CHUNK) {
        await chunk({ importId, customerNumbers: numbers.slice(i, i + CHUNK) });
      }
      const result = await finish({ importId });
      toast.success(t("import.prioDone", { hits: result.prioHits, missing: result.missing }));
      setSheet(null);
    } catch (e) {
      handleError(e, t("import.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4 text-muted-foreground" />
          {t("import.prioTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("import.prioHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilePick
          onSheet={(s) => {
            setSheet(s);
            if (s) setColumn(Math.max(0, guessColumns(s.headers).number));
          }}
        />
        {sheet && (
          <>
            <ColumnSelect
              label={`${t("import.field.number")} · ${t("import.rows", { count: numbers.length })}`}
              headers={sheet.headers}
              value={column}
              optional={false}
              onChange={setColumn}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="ob-reset-prio"
                checked={reset}
                onCheckedChange={(v) => setReset(v === true)}
              />
              <Label htmlFor="ob-reset-prio" className="text-sm font-normal">
                {t("import.resetPrio")}
              </Label>
            </div>
            <Button onClick={() => void run()} disabled={busy || numbers.length === 0}>
              {t("import.startPrio")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ImportHistory() {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const rows = useQuery(api.performance.onboarding.imports, {});
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("import.history")}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("import.historyEmpty")}</p>
        )}
        <ul className="divide-y text-sm">
          {(rows ?? []).map((r) => (
            <li key={r._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium">
                  {r.kind === "report" ? t("import.kindReport") : t("import.kindPrio")}
                </span>{" "}
                <span className="text-muted-foreground">· {r.fileName}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.finished
                    ? r.kind === "report"
                      ? t("import.historyReport", {
                          rows: r.rows,
                          created: r.created,
                          updated: r.updated,
                          missing: r.missing,
                        })
                      : t("import.historyPrio", {
                          rows: r.rows,
                          hits: r.prioHits,
                          missing: r.missing,
                        })
                    : t("import.unfinished")}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(r.startedAt, locale)} · {r.byName}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
