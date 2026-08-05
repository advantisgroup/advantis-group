"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Columns2, GitBranch, Plus, Rows2, Trash2, ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SplitDivider } from "@/components/ui/split-divider";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { FlowNode, type FlowNodeData } from "./FlowNode";

type Orientation = "vertical" | "horizontal";
type PaneOrder = "tree-first" | "details-first";

const SPLIT_KEY = "salesCockpit:flowSplitPct";
const ORIENTATION_KEY = "salesCockpit:flowSplitOrientation";
const ORDER_KEY = "salesCockpit:flowSplitOrder";
const CHILD_X_OFFSET = 300;
const CHILD_Y_STEP = 140;

const nodeTypes: NodeTypes = { flowNode: FlowNode };

type FlowNodeDoc = {
  _id: Id<"salesCockpitFlowNodes">;
  parentId?: Id<"salesCockpitFlowNodes">;
  branchLabel?: string;
  title: string;
  body: string;
  x: number;
  y: number;
};

/** Node/branch editor — title, branch label (the customer answer that leads
 *  here), and the script/response body. Local state so keystrokes don't
 *  each trigger a mutation; changes commit on blur. Keyed by node id at the
 *  call site so switching the selected node resets these fields cleanly. */
function NodeDetailsForm({
  node,
  onSave,
  onAddBranch,
  onDelete,
}: {
  node: FlowNodeDoc;
  onSave: (patch: { title?: string; body?: string; branchLabel?: string }) => void;
  onAddBranch: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("SalesCockpit");
  const isRoot = !node.parentId;
  const [title, setTitle] = useState(node.title);
  const [body, setBody] = useState(node.body);
  const [branchLabel, setBranchLabel] = useState(node.branchLabel ?? "");

  useEffect(() => {
    setTitle(node.title);
    setBody(node.body);
    setBranchLabel(node.branchLabel ?? "");
  }, [node._id, node.title, node.body, node.branchLabel]);

  return (
    <div className="space-y-4 p-4">
      {!isRoot && (
        <div>
          <Label className="mb-1.5 block">{t("flowBranchLabel")}</Label>
          <Input
            value={branchLabel}
            onChange={(e) => setBranchLabel(e.target.value)}
            onBlur={() => onSave({ branchLabel })}
            placeholder={t("flowBranchLabelPlaceholder")}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("flowBranchLabelHint")}</p>
        </div>
      )}
      <div>
        <Label className="mb-1.5 block">{t("flowNodeTitle")}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onSave({ title })}
          placeholder={t("flowNodeTitlePlaceholder")}
        />
      </div>
      <div>
        <Label className="mb-1.5 block">{isRoot ? t("einstiegssatz") : t("flowNodeBody")}</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => onSave({ body })}
          placeholder={t("flowNodeBodyPlaceholder")}
          className="min-h-32"
        />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
        <Button type="button" variant="outline" size="sm" onClick={onAddBranch}>
          <Plus className="size-3.5" />
          {t("flowAddBranch")}
        </Button>
        {!isRoot && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            {t("flowDeleteNode")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function FlowComposer({ flowId }: { flowId: Id<"salesCockpitFlows"> }) {
  const t = useTranslations("SalesCockpit");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const isMobile = useIsMobile();

  const flow = useQuery(api.salesCockpitFlows.getFlow, { flowId });
  const renameFlow = useMutation(api.salesCockpitFlows.renameFlow);
  const upsertNode = useMutation(api.salesCockpitFlows.upsertNode);
  const moveNode = useMutation(api.salesCockpitFlows.moveNode);
  const removeNode = useMutation(api.salesCockpitFlows.removeNode);

  const [titel, setTitel] = useState("");
  useEffect(() => {
    if (flow) setTitel(flow.titel);
  }, [flow]);

  const [selectedId, setSelectedId] = useState<Id<"salesCockpitFlowNodes"> | null>(null);
  const [mobileView, setMobileView] = useState<"flow" | "details">("flow");

  const [orientation, setOrientation] = useState<Orientation>("vertical");
  const [order, setOrder] = useState<PaneOrder>("tree-first");
  const [splitPct, setSplitPct] = useState(62);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const o = localStorage.getItem(ORIENTATION_KEY);
      if (o === "vertical" || o === "horizontal") setOrientation(o);
      const ord = localStorage.getItem(ORDER_KEY);
      if (ord === "tree-first" || ord === "details-first") setOrder(ord);
      const pct = Number(localStorage.getItem(SPLIT_KEY));
      if (Number.isFinite(pct) && pct >= 25 && pct <= 75) setSplitPct(pct);
    } catch {
      // Storage unavailable — defaults stand.
    }
  }, []);

  function persistSplit(pct: number) {
    setSplitPct(pct);
    try {
      localStorage.setItem(SPLIT_KEY, String(pct));
    } catch {
      // Storage unavailable — the split just isn't remembered.
    }
  }

  function toggleOrientation() {
    setOrientation((current) => {
      const next: Orientation = current === "vertical" ? "horizontal" : "vertical";
      try {
        localStorage.setItem(ORIENTATION_KEY, next);
      } catch {
        // Storage unavailable — preference just isn't remembered.
      }
      return next;
    });
  }

  function toggleOrder() {
    setOrder((current) => {
      const next: PaneOrder = current === "tree-first" ? "details-first" : "tree-first";
      try {
        localStorage.setItem(ORDER_KEY, next);
      } catch {
        // Storage unavailable — preference just isn't remembered.
      }
      return next;
    });
  }

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  async function addBranch(parentId: Id<"salesCockpitFlowNodes">) {
    const parent = flow?.nodes.find((n) => n._id === parentId);
    if (!parent) return;
    const siblingCount = flow?.nodes.filter((n) => n.parentId === parentId).length ?? 0;
    try {
      const res = await upsertNode({
        flowId,
        parentId,
        branchLabel: t("flowNeuerZweig"),
        title: t("flowNeuerKnoten"),
        body: "",
        x: parent.x + CHILD_X_OFFSET,
        y: parent.y + siblingCount * CHILD_Y_STEP,
      });
      setSelectedId(res.id);
      if (isMobile) setMobileView("details");
    } catch (error) {
      handleError(error);
    }
  }

  // Rebuilds the canvas from server data whenever it changes — simplest way
  // to stay correct (this is a low-concurrency internal tool, not a
  // real-time multiplayer canvas) since our own writes just echo back the
  // same values we already show locally.
  useEffect(() => {
    if (!flow) return;
    const rfNodes: Node<FlowNodeData>[] = flow.nodes.map((n) => ({
      id: n._id,
      type: "flowNode",
      position: { x: n.x, y: n.y },
      data: {
        title: n.title,
        body: n.body,
        isRoot: !n.parentId,
        selected: n._id === selectedId,
        onAddBranch: () => void addBranch(n._id),
      },
    }));
    const rfEdges: Edge[] = flow.nodes
      .filter((n): n is typeof n & { parentId: Id<"salesCockpitFlowNodes"> } => !!n.parentId)
      .map((n) => ({
        id: `${n.parentId}-${n._id}`,
        source: n.parentId,
        target: n._id,
        label: n.branchLabel || undefined,
        type: "smoothstep",
      }));
    setNodes(rfNodes);
    setEdges(rfEdges);
    if (selectedId && !flow.nodes.some((n) => n._id === selectedId)) {
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, selectedId]);

  const selectedNode = flow?.nodes.find((n) => n._id === selectedId) ?? null;

  async function handleNodeDragStop(_event: unknown, node: Node) {
    try {
      await moveNode({
        nodeId: node.id as Id<"salesCockpitFlowNodes">,
        x: node.position.x,
        y: node.position.y,
      });
    } catch (error) {
      handleError(error);
    }
  }

  function handleNodeClick(_event: unknown, node: Node) {
    setSelectedId(node.id as Id<"salesCockpitFlowNodes">);
    if (isMobile) setMobileView("details");
  }

  async function handleDeleteNode() {
    if (!selectedNode?.parentId) return;
    const ok = await confirm({
      title: t("flowKnotenLoeschenTitel"),
      description: t("flowKnotenLoeschenBeschreibung"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeNode({ nodeId: selectedNode._id });
      setSelectedId(null);
    } catch (error) {
      handleError(error);
    }
  }

  async function saveField(patch: { title?: string; body?: string; branchLabel?: string }) {
    if (!selectedNode) return;
    try {
      await upsertNode({
        flowId,
        nodeId: selectedNode._id,
        title: patch.title ?? selectedNode.title,
        body: patch.body ?? selectedNode.body,
        branchLabel: patch.branchLabel ?? selectedNode.branchLabel,
        x: selectedNode.x,
        y: selectedNode.y,
      });
    } catch (error) {
      handleError(error);
    }
  }

  async function saveTitel() {
    if (!flow) return;
    const trimmed = titel.trim();
    // An emptied-out title can't be saved — revert the field rather than
    // leaving the header looking blank until something else happens to
    // refresh it from the server.
    if (!trimmed) {
      setTitel(flow.titel);
      return;
    }
    if (trimmed === flow.titel) return;
    try {
      await renameFlow({ flowId, titel: trimmed });
    } catch (error) {
      handleError(error);
    }
  }

  const treePane = (
    <div className="relative min-h-0 flex-1">
      {flow === undefined ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );

  const detailsPane = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {!selectedNode ? (
        <EmptyState icon={<GitBranch />} title={t("flowSelectNodeHint")} className="m-4 border-0" />
      ) : (
        <NodeDetailsForm
          key={selectedNode._id}
          node={selectedNode}
          onSave={saveField}
          onAddBranch={() => void addBranch(selectedNode._id)}
          onDelete={() => void handleDeleteNode()}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 md:px-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales-cockpit/flows" aria-label={tc("back")}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          onBlur={() => void saveTitel()}
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-1"
          aria-label={t("titel")}
        />

        {isMobile ? (
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
            {(["flow", "details"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMobileView(v)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  mobileView === v
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "flow" ? t("flowTreeTab") : t("flowDetailsTab")}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleOrientation}>
                  {orientation === "vertical" ? (
                    <Columns2 className="size-4" />
                  ) : (
                    <Rows2 className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {orientation === "vertical" ? t("flowSplitHorizontal") : t("flowSplitVertical")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleOrder}>
                  <ArrowLeftRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("flowSwapSides")}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </header>

      {isMobile ? (
        mobileView === "flow" ? (
          treePane
        ) : (
          detailsPane
        )
      ) : (
        <div
          ref={splitRef}
          className={cn("flex min-h-0 flex-1", orientation === "horizontal" && "flex-col")}
        >
          {order === "tree-first" ? (
            <>
              <div className="flex min-h-0 flex-col" style={paneStyle(splitPct, orientation)}>
                {treePane}
              </div>
              <SplitDivider
                containerRef={splitRef}
                value={splitPct}
                onResize={persistSplit}
                onReset={() => persistSplit(62)}
                orientation={orientation}
                ariaLabel="Resize flow tree and details"
              />
              <div
                className={cn(
                  "flex min-h-0 flex-col bg-muted/10",
                  orientation === "vertical"
                    ? "border-l border-border/60"
                    : "border-t border-border/60",
                )}
                style={paneStyle(100 - splitPct, orientation)}
              >
                {detailsPane}
              </div>
            </>
          ) : (
            <>
              <div
                className={cn(
                  "flex min-h-0 flex-col bg-muted/10",
                  orientation === "vertical"
                    ? "border-r border-border/60"
                    : "border-b border-border/60",
                )}
                style={paneStyle(splitPct, orientation)}
              >
                {detailsPane}
              </div>
              <SplitDivider
                containerRef={splitRef}
                value={splitPct}
                onResize={persistSplit}
                onReset={() => persistSplit(62)}
                orientation={orientation}
                ariaLabel="Resize flow tree and details"
              />
              <div className="flex min-h-0 flex-col" style={paneStyle(100 - splitPct, orientation)}>
                {treePane}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function paneStyle(pct: number, orientation: Orientation) {
  return orientation === "vertical" ? { width: `${pct}%` } : { height: `${pct}%` };
}
