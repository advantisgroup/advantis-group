"use client";

import { type ReactNode } from "react";

import { Plus } from "lucide-react";

import { type EditableEntry } from "@/components/applicants/EditEntryDialog";
import { EntryRow } from "@/components/applicants/EntryRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

import type { LucideIcon } from "lucide-react";

export interface EntryListRow {
  _id: string;
  href: string;
  icon: LucideIcon;
  title: string;
  meta: string;
  note?: string;
  onDelete: () => void;
  edit?: EditableEntry;
}

/**
 * Shared "history list" card used by the Kontakte/Emails/Interviews tabs: a
 * header with a count + "log new" button, one `EntryRow` per item, and an
 * empty state when there are none. Termine has its own layout (upcoming vs.
 * past split with a different card per group), so it doesn't use this.
 */
export function EntryListCard({
  hint,
  historyLabel,
  logLabel,
  onLog,
  secondaryAction,
  emptyIcon,
  emptyLabel,
  deleteLabel,
  editLabel,
  rows,
}: {
  hint?: ReactNode;
  historyLabel: string;
  logLabel: string;
  onLog: () => void;
  /** Another header button next to "log new" (e.g. sending a mail). */
  secondaryAction?: ReactNode;
  emptyIcon: ReactNode;
  emptyLabel: string;
  deleteLabel: string;
  editLabel?: string;
  rows: EntryListRow[];
}) {
  return (
    <div className="space-y-5">
      {hint}
      <Card className="overflow-hidden">
        <div className="flex flex-col items-stretch gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">
            {historyLabel}
            <span className="ml-1.5 text-muted-foreground">({rows.length})</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {secondaryAction}
            <Button size="sm" className="w-full sm:w-auto" onClick={onLog}>
              <Plus className="size-4" />
              {logLabel}
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={emptyIcon}
              title={emptyLabel}
              className="rounded-none border-none"
              action={
                <Button size="sm" onClick={onLog}>
                  <Plus className="size-4" />
                  {logLabel}
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border/70">
              {rows.map((row) => (
                <EntryRow
                  key={row._id}
                  href={row.href}
                  icon={row.icon}
                  title={row.title}
                  meta={row.meta}
                  note={row.note}
                  onDelete={row.onDelete}
                  deleteLabel={deleteLabel}
                  edit={row.edit}
                  editLabel={editLabel}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
