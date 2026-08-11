"use client";

import * as React from "react";
import { Drawer } from "vaul";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface ActionMenuAction {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

export type ActionMenuItem = ActionMenuAction | { key: string; separator: true };

/**
 * A "more options" menu that renders as a Radix dropdown on desktop and a
 * vaul bottom-sheet action list on mobile — small anchored dropdowns are hard
 * to hit precisely with a finger, so touch devices get full-width rows
 * instead.
 */
export function ActionMenu({
  trigger,
  items,
  align = "end",
  ariaLabel,
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  items: ActionMenuItem[];
  align?: "start" | "end" | "center";
  ariaLabel?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  if (isMobile) {
    const mobileTrigger = React.cloneElement(trigger, {
      onClick: (e: React.MouseEvent) => {
        trigger.props.onClick?.(e);
        setOpen(true);
      },
    });
    return (
      <>
        {mobileTrigger}
        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <Drawer.Content
              aria-label={ariaLabel}
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
            >
              <Drawer.Title className="sr-only">{ariaLabel ?? "Menu"}</Drawer.Title>
              <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>
              <div
                className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                {items.map((item) =>
                  "separator" in item ? (
                    <div key={item.key} className="my-1 h-px bg-border" />
                  ) : (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        item.onSelect();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors active:bg-accent [&_svg]:size-4 [&_svg]:shrink-0",
                        item.destructive ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item) =>
          "separator" in item ? (
            <DropdownMenuSeparator key={item.key} />
          ) : (
            <DropdownMenuItem
              key={item.key}
              className={cn(item.destructive && "text-destructive focus:text-destructive")}
              onClick={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
