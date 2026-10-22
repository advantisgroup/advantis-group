"use client";

import { type ComponentType, useState } from "react";

import { ChevronRight, type LucideIcon, Zap } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Feste Werkzeuge in der Wiki-Schnellleiste, die als Pop-up im Intranet
 * aufgehen (eigenständige HTML-Seiten unter public/tools/). Neue Werkzeuge
 * hier eintragen. Statt `src` (iframe) kann ein Werkzeug auch eine
 * React-Komponente (`component`) im Pop-up zeigen. Stand 22.10.2026 (Vahan).
 */
type QuickTool = { key: string; title: string; icon: LucideIcon } & (
  | { src: string; component?: never }
  | { component: ComponentType; src?: never }
);

export const QUICK_TOOLS: readonly QuickTool[] = [
  {
    key: "ladetarife",
    title: "Ladetarife (UTA eCharge & IONITY)",
    src: "/tools/ladetarife.html",
    icon: Zap,
  },
];

export function QuickToolButtons() {
  const [open, setOpen] = useState<QuickTool | null>(null);
  return (
    <>
      {QUICK_TOOLS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          onClick={() => setOpen(tool)}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent"
        >
          <tool.icon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{tool.title}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open?.component ? (
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto sm:max-w-xl">
            <DialogTitle className="pr-10 text-base">{open.title}</DialogTitle>
            <open.component />
          </DialogContent>
        ) : (
          <DialogContent className="flex h-[90vh] w-[96vw] max-w-6xl flex-col gap-2 p-3 sm:max-w-6xl">
            <DialogTitle className="pr-10 text-base">{open?.title}</DialogTitle>
            {open?.src && (
              <iframe
                src={open.src}
                title={open.title}
                allow="clipboard-write"
                className="min-h-0 w-full flex-1 rounded-lg border border-border bg-background"
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
