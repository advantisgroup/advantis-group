"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export interface Sort<K extends string> {
  key: K;
  dir: SortDir;
}

/** Clicking the sorted column flips it; any other column starts at `firstDir`. */
export function nextSort<K extends string>(
  prev: Sort<K> | null,
  key: K,
  firstDir: SortDir = "asc",
): Sort<K> {
  if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir };
}

/** 1 or -1, to multiply into a comparator's result. */
export function sortSign(dir: SortDir): 1 | -1 {
  return dir === "asc" ? 1 : -1;
}

export function ariaSort(active: boolean, dir: SortDir) {
  if (!active) return "none" as const;
  return dir === "asc" ? ("ascending" as const) : ("descending" as const);
}

/** Column label that sorts on click, with an arrow for the current direction. */
export function SortButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      <Icon
        aria-hidden
        className={cn("size-3", !active && "opacity-30 transition-opacity group-hover:opacity-70")}
      />
    </button>
  );
}

/** A table header cell holding a `SortButton`. */
export function SortableHead({ className, ...button }: Parameters<typeof SortButton>[0]) {
  return (
    <TableHead className={className} aria-sort={ariaSort(button.active, button.dir)}>
      <SortButton {...button} />
    </TableHead>
  );
}
