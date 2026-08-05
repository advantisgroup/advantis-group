"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FlowNodeData {
  title: string;
  body: string;
  isRoot: boolean;
  selected: boolean;
  onAddBranch: () => void;
  [key: string]: unknown;
}

/** Custom React Flow node — a compact card showing the node's title and a
 *  snippet of its script/response text, with a "+" affordance (n8n's own
 *  quick-add pattern) to start a new answer branch straight from the node
 *  instead of only via the details panel. */
export function FlowNode({ data }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={cn(
        "relative w-56 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-colors",
        data.selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-ring/50",
      )}
    >
      {!data.isRoot && (
        <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      )}
      <p className="truncate text-sm font-semibold">{data.title || "…"}</p>
      {data.body && (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{data.body}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          data.onAddBranch();
        }}
        aria-label="Add branch"
        className="absolute -right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
