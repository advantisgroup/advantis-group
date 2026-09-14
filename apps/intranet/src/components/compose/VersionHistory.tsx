"use client";

import { Fragment, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import type { Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Bookmark,
  ExternalLink,
  GitBranch,
  History,
  MessageSquare,
  RotateCcw,
  Share2,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SidePanel } from "@/components/ui/side-panel";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type DraftContent, draftContent } from "@/lib/draft-preview";
import { countChangedWords, type DiffToken, diffWords } from "@/lib/text-diff";
import { cn } from "@/lib/utils";
import { type GraphLane, type GraphRow, layoutGraph } from "@/lib/version-graph";

import { DraftComments } from "./DraftComments";
import { ShareVersionDialog, type ShareTarget } from "./ShareVersionDialog";
import { type Draft } from "./use-draft";

type Version = FunctionReturnType<typeof api.drafts.listVersions>["versions"][number];

type ChangeKind =
  | "first"
  | "title"
  | "titleAndText"
  | "added"
  | "removed"
  | "edited"
  | "other"
  | "minor";

interface Change {
  kind: ChangeKind;
  count: number;
  added: number;
  removed: number;
}

interface Entry {
  key: string;
  /** Null for what's in the form right now, before it's become a version. */
  version: Version | null;
  parentKey: string | null;
  savedAt: number;
  content: DraftContent;
  change: Change;
  /** What the form holds right now. */
  current: boolean;
  /** On the line leading to what the form holds. */
  onPath: boolean;
  /** The end of a line that was left behind by going back. */
  sideTip: boolean;
}

const CONTEXT_WORDS = 12;
// Graph geometry, in px: lane width, the dot's centre from the row's top
// (the middle of the first text line), and padding either side.
const LANE = 14;
const NODE_Y = 18;
const GRAPH_PAD = 4;

const laneX = (lane: number) => GRAPH_PAD + lane * LANE + LANE / 2;

function changedFields(from: DraftContent, to: DraftContent): number {
  const keys = new Set([...Object.keys(from.other), ...Object.keys(to.other)]);
  return [...keys].filter((key) => from.other[key] !== to.other[key]).length;
}

/** The auto-written "commit message" for going from a version's parent to it. */
function describeChange(from: DraftContent | null, to: DraftContent): Change {
  if (!from) return { kind: "first", count: 0, added: 0, removed: 0 };
  const title = countChangedWords(diffWords(from.title, to.title));
  const body = countChangedWords(diffWords(from.body, to.body));
  const change = {
    count: Math.max(body.added, body.removed),
    added: title.added + body.added,
    removed: title.removed + body.removed,
  };
  const titleChanged = title.added + title.removed > 0;
  const bodyChanged = body.added + body.removed > 0;
  let kind: ChangeKind;
  if (titleChanged && bodyChanged) kind = "titleAndText";
  else if (titleChanged) kind = "title";
  else if (body.added && body.removed) kind = "edited";
  else if (body.added) kind = "added";
  else if (body.removed) kind = "removed";
  else if (changedFields(from, to)) kind = "other";
  else kind = "minor";
  return { kind, ...change };
}

/** Long unchanged stretches between edits fold down to a few words either
 *  side, the way a diff only shows the lines around a change. */
function shorten(text: string, keepStart: boolean, keepEnd: boolean): string {
  const chunks = text.match(/\s*\S+\s*/g);
  const kept = (Number(keepStart) + Number(keepEnd)) * CONTEXT_WORDS;
  if (!chunks || chunks.length <= kept + 6) return text;
  const parts: string[] = [];
  if (keepStart) parts.push(chunks.slice(0, CONTEXT_WORDS).join("").trimEnd());
  parts.push("…");
  if (keepEnd) parts.push(chunks.slice(-CONTEXT_WORDS).join("").trimStart());
  return `${parts.join(" ")}${keepEnd && /\s$/.test(text) ? " " : ""}`;
}

const ADDED = "rounded-[3px] bg-success/15 box-decoration-clone px-px text-foreground";
const REMOVED =
  "rounded-[3px] bg-destructive/10 box-decoration-clone px-px text-destructive line-through decoration-destructive/60";

function DiffText({ tokens, className }: { tokens: DiffToken[]; className?: string }) {
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {tokens.map((token, i) =>
        token.type === "same" ? (
          <Fragment key={i}>{shorten(token.text, i > 0, i < tokens.length - 1)}</Fragment>
        ) : (
          <span key={i} className={token.type === "added" ? ADDED : REMOVED}>
            {token.text}
          </span>
        ),
      )}
    </p>
  );
}

function hasChanges(tokens: DiffToken[]) {
  return tokens.some((token) => token.type !== "same");
}

/** What bringing a version back would do to the form, as it stands now. */
function Comparison({ now, version }: { now: DraftContent; version: DraftContent }) {
  const t = useTranslations("Compose");
  const title = useMemo(() => diffWords(now.title, version.title), [now.title, version.title]);
  const body = useMemo(() => diffWords(now.body, version.body), [now.body, version.body]);
  const others = changedFields(now, version);
  const same = !hasChanges(title) && !hasChanges(body) && others === 0;

  return (
    <div className="space-y-2.5 rounded-xl border border-border/70 bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium">{t("historyCompare")}</span>
        {!same && (
          <span className="flex items-center gap-2.5">
            <span className={REMOVED}>{t("historyLegendRemoved")}</span>
            <span className={ADDED}>{t("historyLegendAdded")}</span>
          </span>
        )}
      </div>
      {same ? (
        <p className="text-[13px] text-muted-foreground">{t("historySame")}</p>
      ) : (
        <>
          {(now.title || version.title) && (
            <DiffText tokens={title} className="text-sm font-medium leading-snug" />
          )}
          {hasChanges(body) && (
            <DiffText
              tokens={body}
              className="max-h-72 overflow-y-auto text-[13px] leading-relaxed text-foreground/85"
            />
          )}
          {others > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("historyOtherFields", { count: others })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function NameForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Compose");
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <Input
        autoFocus
        value={value}
        maxLength={80}
        aria-label={t("historyName")}
        placeholder={t("historyNamePlaceholder")}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      <Button type="submit" size="sm" disabled={busy}>
        {t("historyNameSave")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        {t("historyNameCancel")}
      </Button>
    </form>
  );
}

function useFormats() {
  const t = useTranslations("Compose");
  const locale = useLocale();
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    const date = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const daysAgo = (ms: number) =>
      Math.round(
        (new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000,
      );
    return {
      time: (ms: number) => time.format(ms),
      day: (ms: number) => {
        const days = daysAgo(ms);
        if (days === 0) return t("historyToday");
        if (days === 1) return t("historyYesterday");
        return date.format(ms);
      },
      dateTime: (ms: number) =>
        daysAgo(ms) === 0 ? time.format(ms) : `${date.format(ms)}, ${time.format(ms)}`,
    };
  }, [locale, t]);
}

function ChangeStat({ change }: { change: Change }) {
  if (!change.added && !change.removed) return null;
  return (
    <span className="flex shrink-0 gap-1.5 pt-0.5 font-mono text-[11px] tabular-nums">
      {change.added > 0 && <span className="text-success">+{change.added}</span>}
      {change.removed > 0 && <span className="text-destructive">−{change.removed}</span>}
    </span>
  );
}

function laneColor(highlighted: boolean) {
  return highlighted ? "bg-primary/55" : "bg-border";
}

/** Lines that just pass by — through a day heading, say. */
function PassingLanes({ lanes, width }: { lanes: GraphLane[]; width: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0" style={{ width }}>
      {lanes.map((lane) => (
        <span
          key={lane.lane}
          className={cn("absolute inset-y-0 w-[1.5px]", laneColor(lane.highlighted))}
          style={{ left: laneX(lane.lane) - 0.75 }}
        />
      ))}
    </div>
  );
}

/** One row's slice of the branch graph: lines in from above, the dot, lines out below. */
function GraphCell({ row, width, entry }: { row: GraphRow; width: number; entry: Entry }) {
  const named = !!entry.version?.name;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0" style={{ width }}>
      <svg width={width} height={NODE_Y} className="absolute left-0 top-0 overflow-visible">
        {row.incoming.map((lane) => {
          const x1 = laneX(lane.lane);
          const x2 = lane.toNode ? laneX(row.column) : x1;
          const d =
            x1 === x2
              ? `M${x1} 0V${NODE_Y}`
              : `M${x1} 0C${x1} ${NODE_Y * 0.75} ${x2} ${NODE_Y * 0.25} ${x2} ${NODE_Y}`;
          return (
            <path
              key={lane.lane}
              d={d}
              fill="none"
              strokeWidth={1.5}
              className={lane.highlighted ? "stroke-primary/55" : "stroke-border"}
            />
          );
        })}
      </svg>
      {row.outgoing.map((lane) => (
        <span
          key={lane.lane}
          className={cn("absolute bottom-0 w-[1.5px]", laneColor(lane.highlighted))}
          style={{ left: laneX(lane.lane) - 0.75, top: NODE_Y }}
        />
      ))}
      <span
        className={cn(
          "absolute size-[11px] rounded-full border-2",
          !entry.version
            ? "border-primary bg-card"
            : entry.current
              ? "border-primary bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
              : named
                ? entry.onPath
                  ? "border-primary bg-primary/70"
                  : "border-foreground/60 bg-foreground/60"
                : entry.onPath
                  ? "border-primary/60 bg-card"
                  : "border-border bg-card",
        )}
        style={{ left: laneX(row.column) - 5.5, top: NODE_Y - 5.5 }}
      />
    </div>
  );
}

function HistoryBody({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const t = useTranslations("Compose");
  const format = useFormats();
  const handleError = useErrorHandler();
  const history = useQuery(api.drafts.listVersions, {
    surface: draft.surface,
    subjectKey: draft.subjectKey,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const contents = useMemo(
    () => new Map((history?.versions ?? []).map((v) => [v._id as string, draftContent(v.data)])),
    [history],
  );
  const nowContent = useMemo(() => draftContent(draft.currentData), [draft.currentData]);

  const entries = useMemo(() => {
    if (!history) return null;
    const { versions, headId } = history;
    const head = versions.find((version) => version._id === headId);
    const showNow = head ? head.data !== draft.currentData : draft.savedAt !== null;

    const path = new Set<string>();
    const parentOf = new Map<string, string | null>(versions.map((v) => [v._id, v.parentId]));
    for (let id: string | null = headId; id && !path.has(id); id = parentOf.get(id) ?? null) {
      path.add(id);
    }
    const children = new Map<string, number>();
    for (const version of versions) {
      if (version.parentId)
        children.set(version.parentId, (children.get(version.parentId) ?? 0) + 1);
    }

    const list: Entry[] = versions.map((version) => {
      const content = contents.get(version._id)!;
      return {
        key: version._id,
        version,
        parentKey: version.parentId,
        savedAt: version.savedAt,
        content,
        change: describeChange(
          version.parentId ? (contents.get(version.parentId) ?? null) : null,
          content,
        ),
        current: !showNow && version._id === headId,
        onPath: path.has(version._id),
        sideTip: !children.has(version._id) && !path.has(version._id),
      };
    });
    if (!showNow) return list;
    return [
      {
        key: "now",
        version: null,
        parentKey: headId,
        savedAt: draft.savedAt ?? Date.now(),
        content: nowContent,
        change: describeChange(headId ? (contents.get(headId) ?? null) : null, nowContent),
        current: true,
        onPath: true,
        sideTip: false,
      },
      ...list,
    ];
  }, [history, contents, nowContent, draft.currentData, draft.savedAt]);

  const graph = useMemo(
    () =>
      layoutGraph(
        (entries ?? []).map((entry) => ({
          id: entry.key,
          parentId: entry.parentKey,
          highlighted: entry.onPath,
        })),
      ),
    [entries],
  );
  const graphWidth = GRAPH_PAD * 2 + graph.lanes * LANE;

  function summary(entry: Entry) {
    const { kind, count } = entry.change;
    return t(`versionChange.${kind}`, { count });
  }

  async function restore(version: Version) {
    setBusy(true);
    try {
      const { previousVersionId } = await draft.restoreVersion(version._id);
      onClose();
      toast.success(t("draftsVersionRestored", { time: format.dateTime(version.savedAt) }), {
        description: t("draftsVersionRestoredBody"),
        duration: 10_000,
        action: previousVersionId
          ? {
              label: t("draftsUndo"),
              onClick: () => {
                void draft
                  .restoreVersion(previousVersionId)
                  .then(() => toast.success(t("draftsUndoDone")))
                  .catch(handleError);
              },
            }
          : undefined,
      });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function saveName(versionId: Id<"draftVersions"> | null, name: string) {
    setBusy(true);
    try {
      await draft.nameVersion(versionId, name);
      setNaming(null);
      if (name.trim()) toast.success(t("historyNamed"));
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  if (entries === null) return null;
  if (entries.length === 0) {
    return (
      <EmptyState
        className="mt-5"
        icon={<History />}
        title={t("historyEmptyTitle")}
        description={t("historyEmptyBody")}
      />
    );
  }

  // Day headings sit between rows, so the lines leaving the row above run through them.
  const items: (
    | { kind: "day"; label: string; lanes: GraphLane[] }
    | { kind: "entry"; index: number }
  )[] = [];
  let lastLabel = "";
  entries.forEach((entry, index) => {
    const label = format.day(entry.savedAt);
    if (label !== lastLabel) {
      items.push({ kind: "day", label, lanes: index > 0 ? graph.rows[index - 1].outgoing : [] });
      lastLabel = label;
    }
    items.push({ kind: "entry", index });
  });

  return (
    <div className="pb-2">
      <ol className="pt-2">
        {items.map((item) => {
          if (item.kind === "day") {
            return (
              <li key={`day:${item.label}`} className="relative pb-1 pt-4">
                <PassingLanes lanes={item.lanes} width={graphWidth} />
                <h3
                  className="text-xs font-semibold text-muted-foreground"
                  style={{ paddingLeft: graphWidth + 4 }}
                >
                  {item.label}
                </h3>
              </li>
            );
          }

          const entry = entries[item.index];
          const row = graph.rows[item.index];
          const { version } = entry;
          const open = selected === entry.key;
          const sharedWith = version?.sharedWith ?? [];
          return (
            <li key={entry.key} className="relative">
              <GraphCell row={row} width={graphWidth} entry={entry} />
              <button
                type="button"
                aria-expanded={open}
                onClick={() => {
                  setSelected(open ? null : entry.key);
                  setNaming(null);
                }}
                style={{ paddingLeft: graphWidth + 4 }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg py-2 pr-1.5 text-left transition-colors hover:bg-accent/60",
                  open && "bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] leading-5">
                    <span className={cn("truncate", (version?.name || !version) && "font-medium")}>
                      {version ? version.name || summary(entry) : t("historyNow")}
                    </span>
                    {entry.current && version && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10.5px] font-medium leading-4 text-primary">
                        {t("historyCurrentBadge")}
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">
                      {version
                        ? version.name
                          ? `${format.time(entry.savedAt)} · ${summary(entry)}`
                          : format.time(entry.savedAt)
                        : `${t("historyNowMeta")} · ${summary(entry)}`}
                    </span>
                    {sharedWith.length > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <Users className="size-3" />
                        {sharedWith.length}
                      </span>
                    )}
                    {(version?.comments ?? 0) > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <MessageSquare className="size-3" />
                        {version!.comments}
                      </span>
                    )}
                  </span>
                  {entry.sideTip && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 text-[10.5px] font-medium leading-4 text-muted-foreground">
                      <GitBranch className="size-3" />
                      {t("historyBranchKept")}
                    </span>
                  )}
                </span>
                <ChangeStat change={entry.change} />
              </button>

              {open && (
                <div
                  className="ai-rise space-y-3 pb-3 pr-1 pt-1.5"
                  style={{ paddingLeft: graphWidth + 4 }}
                >
                  {version ? (
                    <Comparison now={nowContent} version={entry.content} />
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("historyNowHint")}
                    </p>
                  )}

                  {naming === entry.key ? (
                    <NameForm
                      initial={version?.name ?? ""}
                      busy={busy}
                      onSave={(name) => void saveName(version?._id ?? null, name)}
                      onCancel={() => setNaming(null)}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {version && !entry.current && (
                        <Button size="sm" disabled={busy} onClick={() => void restore(version)}>
                          <RotateCcw />
                          {t("historyRestore")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={version && !entry.current ? "outline" : "default"}
                        disabled={busy}
                        onClick={() =>
                          setShareTarget({
                            versionId: version?._id ?? null,
                            when: format.dateTime(entry.savedAt),
                          })
                        }
                      >
                        <Share2 />
                        {sharedWith.length > 0 ? t("historyShareMore") : t("historyShare")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setNaming(entry.key)}
                      >
                        <Bookmark />
                        {version?.name ? t("historyRename") : t("historyName")}
                      </Button>
                    </div>
                  )}

                  {version && !entry.current && naming !== entry.key && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("historyRestoreHint")}
                    </p>
                  )}

                  {version && (sharedWith.length > 0 || version.comments > 0) && (
                    <section className="space-y-3 border-t border-border/60 pt-3">
                      {sharedWith.length > 0 && (
                        <div className="flex items-center gap-2">
                          <AvatarStack
                            size="size-6"
                            max={4}
                            people={sharedWith.map((person) => ({
                              id: person._id,
                              name: person.name,
                              avatar: person.avatar,
                            }))}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {t("historySharedWith", {
                              name: sharedWith[0].name,
                              others: sharedWith.length - 1,
                            })}
                          </span>
                          <Link
                            href={`/drafts/shared/${version._id}`}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            {t("historyOpenShared")}
                            <ExternalLink className="size-3" />
                          </Link>
                        </div>
                      )}
                      <DraftComments versionId={version._id} />
                    </section>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {graph.lanes > 1 && (
        <p className="mt-4 flex gap-2 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
          <GitBranch className="mt-0.5 size-3.5 shrink-0" />
          {t("historyBranchLegend")}
        </p>
      )}

      <ShareVersionDialog
        draft={draft}
        target={shareTarget}
        onOpenChange={(open) => !open && setShareTarget(null)}
      />
    </div>
  );
}

/** Every earlier version of the draft behind a form, Google Docs style: a
 *  panel beside the form, grouped by day, drawn as branches where someone
 *  went back and wrote on, each version comparable against the form before
 *  anything is brought back. */
export function VersionHistory({
  draft,
  open,
  onOpenChange,
}: {
  draft: Draft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Compose");
  const tc = useTranslations("Common");
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("historyTitle")}
      closeLabel={tc("close")}
      header={
        <div className="space-y-1 pr-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug tracking-tight">
            <History className="size-[18px] text-muted-foreground" />
            {t("historyTitle")}
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("historyIntro")}</p>
        </div>
      }
    >
      {open && <HistoryBody draft={draft} onClose={() => onOpenChange(false)} />}
    </SidePanel>
  );
}
