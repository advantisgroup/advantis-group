"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { ArrowLeft, RotateCcw, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

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

  if (flow === undefined) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const activeId = currentId ?? rootId;
  const node = activeId ? nodesById.get(activeId) : undefined;
  if (!node || !rootId) {
    return <p className="text-sm italic text-muted-foreground">{t("flowLeer")}</p>;
  }

  const children = childrenByParent.get(node._id) ?? [];
  const isRoot = node._id === rootId;

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{flow.titel}</p>
          <p className="mt-0.5 text-sm font-semibold">{node.title}</p>
        </div>
        <Link
          href={`/sales-cockpit/flows/${flowId}`}
          target="_blank"
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
          {t("flowEditorOeffnen")}
        </Link>
      </div>

      <p className="whitespace-pre-wrap text-base leading-relaxed">
        {node.body || <i className="text-muted-foreground">{t("flowKeinScript")}</i>}
      </p>

      {children.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("flowKundenantwort")}
          </p>
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <button
                key={child._id}
                type="button"
                onClick={() => setCurrentId(child._id)}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
              >
                {child.branchLabel || child.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">{t("flowAstEnde")}</p>
      )}

      {!isRoot && (
        <div className="flex gap-2 border-t border-primary/20 pt-3">
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
}
