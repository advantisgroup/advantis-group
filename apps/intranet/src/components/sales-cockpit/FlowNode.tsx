"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Play, Plus } from "lucide-react";

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
 *  instead of only via the details panel. The root gets a distinct
 *  accent/icon since it's the one node every call starts from. */
export function FlowNode({ data }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={cn(
        "relative w-60 rounded-xl border bg-card px-3.5 py-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all",
        data.isRoot && "bg-gradient-to-br from-primary/[0.07] to-transparent",
        data.selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-ring/50 hover:shadow-[0_2px_10px_-4px_rgb(0_0_0/0.15)]",
      )}
    >
      {!data.isRoot && (
        <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      )}
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md",
            data.isRoot ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {data.isRoot ? (
            <Play className="size-3 fill-current" />
          ) : (
            <MessageSquare className="size-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-semibold leading-tight">{data.title || "…"}</p>
          {data.body && (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {data.body}
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          data.onAddBranch();
        }}
        aria-label="Add branch"
        // `nodrag` is React Flow's own convention for opting an element out
        // of node-drag/pan handling — without it, a touch tap here is
        // ambiguous with "start dragging/panning the canvas".
        className="nodrag absolute -right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
