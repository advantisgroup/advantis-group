"use client";

import { type ReactNode, useState } from "react";

import { Check, Plus, SlidersHorizontal, X } from "lucide-react";

import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  leading?: ReactNode;
}

/**
 * A filter that says what it's doing: dashed "+ Category" until something is
 * picked, then solid "Category: SF, Hardware ×". The × clears it in one click
 * without reopening the list.
 */
export function FilterPill({
  label,
  options,
  selected,
  onChange,
  clearLabel,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  clearLabel: string;
}) {
  const active = selected.length > 0;
  const names = options.filter((o) => selected.includes(o.value)).map((o) => o.label);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <Popover>
      <PopoverAnchor asChild>
        <span
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full border text-[12.5px] font-medium transition-colors md:h-7",
            active
              ? "border-border bg-card text-foreground"
              : "border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-full min-w-0 items-center gap-1.5 rounded-full pl-2.5",
                active ? "pr-1" : "pr-3",
              )}
            >
              {!active && <Plus className="size-3.5" />}
              {label}
              {active && (
                <span className="max-w-40 truncate font-semibold text-primary">
                  {names.join(", ")}
                </span>
              )}
            </button>
          </PopoverTrigger>
          {active && (
            <button
              type="button"
              aria-label={clearLabel}
              onClick={() => onChange([])}
              className="mr-1 grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-60 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => toggle(option.value)}
              className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-accent md:min-h-8"
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-border",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              {option.leading}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * The same filters as one button and a sheet, for phones. A row of pills that
 * each open their own popover works on a wide screen; on a 360px one it wraps,
 * eats the space above the content, and puts two small tap targets where a
 * thumb has to reach past the list to get at them.
 */
export function FilterSheet({
  groups,
  label,
  clearLabel,
  className,
}: {
  groups: FilterGroup[];
  label: string;
  clearLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = groups.reduce((sum, group) => sum + group.selected.length, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
          activeCount > 0
            ? "border-border bg-card text-foreground"
            : "border-dashed border-border text-muted-foreground",
          className,
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        {label}
        {activeCount > 0 && (
          <span className="tabular-nums font-semibold text-primary">{activeCount}</span>
        )}
      </button>
      <MobileDrawer open={open} onOpenChange={setOpen} ariaLabel={label}>
        <div className="flex items-center justify-between border-b border-border/70 px-5 pb-3">
          <p className="font-display text-lg font-semibold leading-tight tracking-tight">{label}</p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => groups.forEach((group) => group.onChange([]))}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {clearLabel}
            </button>
          )}
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              {group.options.map((option) => {
                const on = group.selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() =>
                      group.onChange(
                        on
                          ? group.selected.filter((v) => v !== option.value)
                          : [...group.selected, option.value],
                      )
                    }
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-md text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                        on ? "border-foreground bg-foreground text-background" : "border-border",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {option.leading}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {option.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </MobileDrawer>
    </>
  );
}

/** A one-click preset next to the filter pills ("Needs attention", "Unassigned"). */
export function TogglePill({
  active,
  onClick,
  count,
  dotClassName,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  /** e.g. "bg-warn" — the preset's meaning, shown before the label. */
  dotClassName?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors md:h-7",
        active
          ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
          : "border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {dotClassName && <span className={cn("size-1.5 rounded-full", dotClassName)} />}
      {children}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
