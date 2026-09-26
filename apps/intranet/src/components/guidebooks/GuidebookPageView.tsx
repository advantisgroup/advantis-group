"use client";

import { AlertTriangle, Info } from "lucide-react";

import { useInPrintSheet } from "@/components/print/PrintSheet";
import { RichText } from "@/components/ui/rich-text";
import { type Block } from "@/lib/guidebook-blocks";
import { cn } from "@/lib/utils";

const CALLOUT_STYLES: Record<"info" | "warning", string> = {
  info: "border-sky-400/40 bg-sky-500/10 text-sky-900 dark:text-sky-100 refreshed:border-info/30 refreshed:bg-info/10 refreshed:text-foreground",
  warning:
    "border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-100 refreshed:border-warn/30 refreshed:bg-warn/10 refreshed:text-foreground",
};

/** Read-only render of a guidebook page's blocks — the counterpart to
 * BlockEditor, used on `/guidebooks/<slug>` for custom (DB-backed) pages. */
export function GuidebookPageView({ blocks }: { blocks: Block[] }) {
  // The on-screen copy already offers any dates in it to the calendar.
  const autoSaveDates = !useInPrintSheet();
  return (
    <div className="space-y-4">
      {blocks.map((block) => {
        switch (block.type) {
          case "text":
            return <RichText key={block.id} html={block.html} autoSaveDates={autoSaveDates} />;
          case "callout":
            return (
              <div
                key={block.id}
                className={cn(
                  "flex gap-2.5 rounded-lg border px-4 py-3",
                  CALLOUT_STYLES[block.variant],
                )}
              >
                {block.variant === "info" ? (
                  <Info className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                )}
                <RichText
                  html={block.html}
                  autoSaveDates={autoSaveDates}
                  className="min-w-0 flex-1 [&>*:first-child]:mt-0"
                />
              </div>
            );
          case "image":
            return block.url ? (
              <figure key={block.id} className="space-y-1.5">
                <img
                  src={block.url}
                  alt={block.caption || ""}
                  className="w-full rounded-lg border border-border"
                />
                {block.caption && (
                  <figcaption className="text-center text-xs text-muted-foreground">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            ) : null;
          case "code":
            return (
              <pre
                key={block.id}
                className="overflow-x-auto rounded-lg bg-muted px-3.5 py-3 font-mono text-sm"
              >
                <code>{block.code}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
