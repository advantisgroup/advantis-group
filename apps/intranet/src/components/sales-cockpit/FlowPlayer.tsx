"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { ArrowLeft, Maximize2, Minimize2, RotateCcw, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FlowNode = NonNullable<
  ReturnType<typeof useQuery<typeof api.salesCockpitFlows.getFlow>>
>["nodes"][number];

/**
 * The actual call-time consumption of a Flow: one node at a time, read the
 * script out loud, then tap whichever branch matches the customer's actual
 * answer to move on — as opposed to `/sales-cockpit/flows/[flowId]`, which
 * is the authoring canvas for *building* that tree, not walking it live.
 */
export function FlowPlayer({ flowId }: { flowId: Id<"salesCockpitFlows"> }) {
  const t = useTranslations("SalesCockpit");
  const flow = useQuery(api.salesCockpitFlows.getFlow, { flowId });
  const [currentId, setCurrentId] = useState<Id<"salesCockpitFlowNodes"> | null>(null);
  const [focus, setFocus] = useState(false);

  const { nodesById, childrenByParent, rootId } = useMemo(() => {
    const nodesById = new Map<Id<"salesCockpitFlowNodes">, FlowNode>();
    const childrenByParent = new Map<Id<"salesCockpitFlowNodes">, FlowNode[]>();
    let rootId: Id<"salesCockpitFlowNodes"> | null = null;
    for (const n of flow?.nodes ?? []) {
      nodesById.set(n._id, n);
      if (!n.parentId) {
        rootId = n._id;
        continue;
      }
      const list = childrenByParent.get(n.parentId) ?? [];
      list.push(n);
      childrenByParent.set(n.parentId, list);
    }
    return { nodesById, childrenByParent, rootId };
  }, [flow]);

  const activeId = currentId ?? rootId;
  const node = activeId ? nodesById.get(activeId) : undefined;
  const children = node ? (childrenByParent.get(node._id) ?? []) : [];

  // In focus mode the keyboard drives the call: 1–9 picks an answer,
  // Backspace steps back, Escape leaves.
  useEffect(() => {
    const current = activeId ? nodesById.get(activeId) : undefined;
    if (!focus || !current) return;
    const options = childrenByParent.get(current._id) ?? [];
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocus(false);
      else if (e.key === "Backspace" && current!.parentId) setCurrentId(current!.parentId);
      else if (/^[1-9]$/.test(e.key)) {
        const child = options[Number(e.key) - 1];
        if (child) setCurrentId(child._id);
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, activeId, nodesById, childrenByParent]);

  if (flow === undefined) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (!node || !rootId) {
    return <p className="text-sm text-muted-foreground">{t("flowLeer")}</p>;
  }

  const isRoot = node._id === rootId;
  const path: FlowNode[] = [];
  for (
    let n: FlowNode | undefined = node;
    n;
    n = n.parentId ? nodesById.get(n.parentId) : undefined
  ) {
    path.unshift(n);
  }

  const stage = (
    <div className={cn("space-y-5", focus && "mx-auto w-full max-w-3xl")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{flow.titel}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {path.map((step, i) => (
              <span key={step._id} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden>›</span>}
                <button
                  type="button"
                  onClick={() => setCurrentId(step._id)}
                  className={cn(
                    "rounded px-1 hover:bg-accent",
                    step._id === node._id && "font-medium text-foreground",
                  )}
                >
                  {i === 0 ? step.title : step.branchLabel || step.title}
                </button>
              </span>
            ))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!focus && (
            <Link
              href={`/sales-cockpit/flows/${flowId}`}
              target="_blank"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
              {t("flowEditorOeffnen")}
            </Link>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFocus((f) => !f)}
            aria-pressed={focus}
          >
            {focus ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            {focus ? t("flowFocusExit") : t("flowFocus")}
          </Button>
        </div>
      </div>

      <p
        className={cn(
          "whitespace-pre-wrap leading-relaxed text-balance",
          focus ? "text-2xl md:text-3xl" : "text-base",
        )}
      >
        {node.body || <span className="text-muted-foreground">{t("flowKeinScript")}</span>}
      </p>

      {children.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("flowKundenantwort")}</p>
          <div className={cn("flex flex-wrap gap-2", focus && "grid gap-2 sm:grid-cols-2")}>
            {children.map((child, i) => (
              <button
                key={child._id}
                type="button"
                onClick={() => setCurrentId(child._id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-full border border-border/70 bg-background font-medium transition-colors hover:border-foreground/40 hover:bg-accent/60",
                  focus ? "rounded-xl px-4 py-3 text-left text-base" : "px-4 py-2 text-sm",
                )}
              >
                {focus && i < 9 && (
                  <kbd className="grid size-6 shrink-0 place-items-center rounded-md border border-border/80 bg-muted font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </kbd>
                )}
                {child.branchLabel || child.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("flowAstEnde")}</p>
      )}

      {!isRoot && (
        <div className="flex gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentId(node.parentId ?? rootId)}
          >
            <ArrowLeft className="size-3.5" />
            {t("flowZurueck")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCurrentId(rootId)}>
            <RotateCcw className="size-3.5" />
            {t("flowVonVorne")}
          </Button>
        </div>
      )}
    </div>
  );

  if (focus) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={flow.titel}
        className="fixed inset-0 z-50 flex overflow-y-auto bg-background px-6 py-10"
      >
        <div className="m-auto w-full">{stage}</div>
      </div>
    );
  }

  return <section className="rounded-2xl border border-border/70 bg-card p-5">{stage}</section>;
}
