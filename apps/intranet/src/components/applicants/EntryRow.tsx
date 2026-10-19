"use client";

import Link from "next/link";

import { useState } from "react";

import { ChevronRight, Pencil, Trash2 } from "lucide-react";

import { type EditableEntry, EditEntryDialog } from "@/components/applicants/EditEntryDialog";

import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

/**
 * Shared activity row used by the Kontakte/Emails/Interviews history tabs:
 * icon chip, title, meta line, optional note preview, chevron affordance,
 * a pencil to edit the entry, and a hover-revealed delete button. Rendered inside a `divide-y` list.
 */
export function EntryRow({
  href,
  icon: Icon,
  title,
  meta,
  note,
  onDelete,
  deleteLabel,
  edit,
  editLabel,
  iconClassName,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  meta: string;
  note?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Shows the pencil; the edit dialog lives here, outside the link. */
  edit?: EditableEntry;
  editLabel?: string;
  iconClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Link
        href={href}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent/50"
      >
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
            iconClassName,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
          {note && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 self-center">
          {edit && (
            <button
              type="button"
              aria-label={editLabel}
              title={editLabel}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
              }}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="size-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={deleteLabel}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
      <EditEntryDialog target={editing && edit ? edit : null} onClose={() => setEditing(false)} />
    </>
  );
}
