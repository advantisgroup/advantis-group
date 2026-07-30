"use client";

import { type ReactNode, useState } from "react";

import { UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Wraps content with an inline drag-and-drop target — dragging files over it
 * dashes the border and shows `hint`; dropping calls `onFiles`. `disabled`
 * quietly ignores drag events instead of hiding itself, so callers can pass
 * a permission check straight through without an extra conditional wrapper.
 */
export function AttachmentDropZone({
  onFiles,
  hint,
  disabled,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  hint: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn("relative", className)}
      onDragOver={(e) => {
        // Always suppress the browser's default (navigating to the dropped
        // file) for a file drag — even when disabled, only the highlight
        // and onFiles below are conditional, not the preventDefault.
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          <UploadCloud className="size-4" />
          {hint}
        </div>
      )}
    </div>
  );
}
