"use client";

import { type ReactNode } from "react";

import { Plus } from "lucide-react";

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
  emptyIcon,
  emptyLabel,
  deleteLabel,
  rows,
}: {
  hint?: ReactNode;
  historyLabel: string;
  logLabel: string;
  onLog: () => void;
  emptyIcon: ReactNode;
  emptyLabel: string;
  deleteLabel: string;
  rows: EntryListRow[];
}) {
  return (
    <div className="space-y-5">
      {hint}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
          <p className="text-sm font-semibold">
            {historyLabel}
            <span className="ml-1.5 text-muted-foreground">({rows.length})</span>
          </p>
          <Button size="sm" onClick={onLog}>
            <Plus className="size-4" />
            {logLabel}
          </Button>
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
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
