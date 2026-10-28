"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import {
  allNodeIds,
  OUTCOME_KINDS,
  type OutcomeKind,
  type OutcomeTop,
} from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

type EditNode = {
  id: string;
  label: string;
  kind?: OutcomeKind;
  freetext?: boolean;
  archived?: boolean;
  children?: EditNode[];
};

const MAX_DEPTH = 3;

const newId = (prefix: string) =>
  `${prefix}.n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * The situation editor (admins and team leads): rename and add situations,
 * reasons and sub-reasons, set what a situation means (its kind – "wird
 * kündigen" closes onto winback), ask for free text, hide entries. Saved
 * entries can't be deleted, only hidden, so cases that used them keep
 * their labels. The phases themselves are fixed.
 */
export function StatusEditor() {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const config = useQuery(api.performance.onboarding.statusConfig, {});
  const save = useMutation(api.performance.onboarding.saveStatusConfig);
  const [draft, setDraft] = useState<OutcomeTop[] | null>(null);
  const [busy, setBusy] = useState(false);

  const savedIds = useMemo(
    () => new Set(config ? allNodeIds({ outcomes: config.outcomes }) : []),
    [config],
  );

  if (!config) return <Skeleton className="h-96 w-full" />;
  const outcomes: OutcomeTop[] = draft ?? config.outcomes;
  const change = (fn: (next: EditNode[]) => void) => {
    const next = structuredClone(outcomes) as EditNode[];
    fn(next);
    setDraft(next as OutcomeTop[]);
  };

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await save({ outcomes: draft });
      toast.success(t("editor.saved"));
      setDraft(null);
    } catch (e) {
      handleError(e, t("editor.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{t("editor.intro")}</p>
        <div className="flex gap-2">
          {draft && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              {t("editor.discard")}
            </Button>
          )}
          <Button size="sm" disabled={!draft || busy} onClick={() => void submit()}>
            {t("editor.save")}
          </Button>
        </div>
      </div>

      <section className="space-y-2 rounded-xl border border-border/70 bg-card p-4">
        <NodeList nodes={outcomes as EditNode[]} depth={1} savedIds={savedIds} onChange={change} />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            change((n) => void n.push({ id: newId("lage"), label: "", kind: "other" }))
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("editor.addOutcome")}
        </Button>
      </section>

      {config.updatedByName && (
        <p className="text-xs text-muted-foreground">
          {t("dist.teamUpdated", { name: config.updatedByName })}
        </p>
      )}
    </div>
  );
}

function NodeList({
  nodes,
  depth,
  savedIds,
  onChange,
}: {
  nodes: EditNode[];
  depth: number;
  savedIds: Set<string>;
  onChange: (fn: (list: EditNode[]) => void) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  return (
    <ul className={cn("space-y-1", depth > 1 && "ml-6 border-l border-border/70 pl-3")}>
      {nodes.map((node, i) => (
        <li key={node.id} className="space-y-1">
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg px-1 py-1",
              node.archived && "opacity-50",
            )}
          >
            <Input
              value={node.label}
              placeholder={t("editor.labelHint")}
              className="h-8 min-w-[200px] flex-1"
              onChange={(e) => onChange((l) => void (l[i].label = e.target.value))}
            />
            {depth === 1 && (
              <Select
                value={node.kind ?? "other"}
                onValueChange={(v) => onChange((l) => void (l[i].kind = v as OutcomeKind))}
              >
                <SelectTrigger className="h-8 w-[190px]" aria-label={t("editor.kind")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`editor.kinds.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={!!node.freetext}
                onCheckedChange={(v) =>
                  onChange((l) => void (l[i].freetext = v === true ? true : undefined))
                }
              />
              {t("editor.freetext")}
            </label>
            {node.archived && <Badge variant="muted">{t("editor.hidden")}</Badge>}
            <div className="ml-auto flex items-center">
              <IconButton
                label={t("editor.up")}
                disabled={i === 0}
                onClick={() =>
                  onChange((l) => {
                    [l[i - 1], l[i]] = [l[i], l[i - 1]];
                  })
                }
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={t("editor.down")}
                disabled={i === nodes.length - 1}
                onClick={() =>
                  onChange((l) => {
                    [l[i + 1], l[i]] = [l[i], l[i + 1]];
                  })
                }
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              {depth < MAX_DEPTH && (
                <IconButton
                  label={t("editor.addChild")}
                  onClick={() =>
                    onChange((l) => {
                      l[i].children = [...(l[i].children ?? []), { id: newId(node.id), label: "" }];
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </IconButton>
              )}
              {savedIds.has(node.id) ? (
                <IconButton
                  label={node.archived ? t("editor.show") : t("editor.hide")}
                  onClick={() =>
                    onChange((l) => void (l[i].archived = !l[i].archived || undefined))
                  }
                >
                  {node.archived ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </IconButton>
              ) : (
                <IconButton
                  label={t("editor.remove")}
                  onClick={() => onChange((l) => void l.splice(i, 1))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
          </div>
          {(node.children?.length ?? 0) > 0 && (
            <NodeList
              nodes={node.children!}
              depth={depth + 1}
              savedIds={savedIds}
              onChange={(fn) => onChange((l) => fn(l[i].children!))}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
