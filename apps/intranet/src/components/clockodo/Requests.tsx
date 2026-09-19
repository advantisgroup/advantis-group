"use client";

import {
  ABSENCE_STATUSES,
  ABSENCE_TYPES,
  AbsenceStatusBadge,
  AbsenceTypeLabel,
  ClockodoAbsenceDialog,
  STATUS_ACCENT,
  TYPE_STYLE,
} from "@/components/clockodo/parts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { workingDays } from "@/lib/absences";
import { type MyAbsence } from "@/lib/absences-api";
import { formatIsoDate } from "@/lib/format";
import { CalendarArrowDown, Pencil, Plane, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

/** Your absence requests and a new one. */

export function Requests({
  mine,
  onExport,
  onSaved,
}: {
  mine: MyAbsence[] | undefined;
  onExport: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MyAbsence | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const dialogs = (
    <>
      <ClockodoAbsenceDialog
        absence={null}
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={onSaved}
      />
      <ClockodoAbsenceDialog
        absence={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={onSaved}
      />
    </>
  );

  const search = query.trim().toLowerCase();
  const rows = (mine ?? [])
    .filter(
      (absence) =>
        (!search || `${t(absence.type)} ${absence.reason ?? ""}`.toLowerCase().includes(search)) &&
        (statuses.length === 0 || statuses.includes(absence.status)) &&
        (types.length === 0 || types.includes(absence.type)),
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const range = (absence: MyAbsence) =>
    `${formatIsoDate(absence.startDate, locale)} – ${formatIsoDate(absence.endDate, locale)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-64" data-tour="tour-absences-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchRequests")}
            aria-label={t("searchRequests")}
            className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-1">
          <FilterPill
            label={t("status")}
            options={ABSENCE_STATUSES.map((status) => ({
              value: status,
              label: t(status),
              count: (mine ?? []).filter((absence) => absence.status === status).length,
              leading: (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: STATUS_ACCENT[status] }}
                />
              ),
            }))}
            selected={statuses}
            onChange={setStatuses}
            clearLabel={t("clearFilter", { label: t("status") })}
          />
          <FilterPill
            label={t("type")}
            options={ABSENCE_TYPES.map((type) => ({
              value: type,
              label: t(type),
              leading: (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: TYPE_STYLE[type].accent }}
                />
              ),
            }))}
            selected={types}
            onChange={setTypes}
            clearLabel={t("clearFilter", { label: t("type") })}
          />
          <div className="ml-auto flex items-center gap-2" data-tour="tour-absences-new">
            <Button variant="ghost" size="sm" onClick={onExport}>
              <CalendarArrowDown />
              <span className="max-sm:sr-only">{t("exportIcs")}</span>
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus />
              {t("newAbsence")}
            </Button>
          </div>
        </div>
      </div>

      <div data-tour="tour-absences-list">
        {mine === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Plane />}
            title={mine.length === 0 ? t("noAbsences") : t("noRequestsFiltered")}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("type")}</TableHead>
                  <TableHead className="w-60">{t("period")}</TableHead>
                  <TableHead className="w-20 text-right">{t("absenceDays")}</TableHead>
                  <TableHead className="w-32">{t("status")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((absence) => {
                  const editable = absence.status === "pending";
                  return (
                    <TableRow
                      key={absence.id}
                      tabIndex={editable ? 0 : undefined}
                      title={editable ? t("editAbsence") : undefined}
                      onClick={editable ? () => setEditing(absence) : undefined}
                      onKeyDown={(event) => {
                        if (editable && event.key === "Enter") setEditing(absence);
                      }}
                      className={
                        editable
                          ? "cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                          : "hover:bg-transparent"
                      }
                    >
                      <TableCell className="w-full max-w-0">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="shrink-0 font-medium">
                            <AbsenceTypeLabel type={absence.type} />
                          </span>
                          {absence.reason && (
                            <span className="truncate text-muted-foreground">{absence.reason}</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{range(absence)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {workingDays(absence.startDate, absence.endDate, absence.halfDay)}
                      </TableCell>
                      <TableCell>
                        <AbsenceStatusBadge status={absence.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {editable && (
                          <Pencil aria-hidden className="ml-auto size-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <ul className="divide-y divide-border/60 md:hidden">
              {rows.map((absence) => (
                <li key={absence.id}>
                  <button
                    type="button"
                    disabled={absence.status !== "pending"}
                    onClick={() => setEditing(absence)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                  >
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-sm font-medium">
                        <AbsenceTypeLabel type={absence.type} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {range(absence)} ·{" "}
                        {t("workingDaysLabel", {
                          count: workingDays(absence.startDate, absence.endDate, absence.halfDay),
                        })}
                      </span>
                    </span>
                    <AbsenceStatusBadge status={absence.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {dialogs}
    </div>
  );
}
