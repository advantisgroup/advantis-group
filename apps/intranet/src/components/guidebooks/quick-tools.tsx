"use client";

import { useState } from "react";

import { CalendarCheck, ChevronRight } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Feste Werkzeuge in der Wiki-Schnellleiste, die als Pop-up im Intranet
 * aufgehen (eigenständige HTML-Seiten unter public/tools/). Neue Werkzeuge
 * hier eintragen. Stand 20.10.2026 (Vahan).
 */
export const QUICK_TOOLS = [
  {
    key: "terminprozess-ev-check",
    title: "Terminprozess E-Mobilitäts-Check",
    src: "/tools/terminprozess-ev-check.html",
    icon: CalendarCheck,
  },
] as const;

export function QuickToolButtons() {
  const [open, setOpen] = useState<(typeof QUICK_TOOLS)[number] | null>(null);
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
        <DialogContent className="flex h-[90vh] w-[96vw] max-w-6xl flex-col gap-2 p-3 sm:max-w-6xl">
          <DialogTitle className="pr-10 text-base">{open?.title}</DialogTitle>
          {open && (
            <iframe
              src={open.src}
              title={open.title}
              allow="clipboard-write"
              className="min-h-0 w-full flex-1 rounded-lg border border-border bg-background"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
