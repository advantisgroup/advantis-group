"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { type GuidebookTopic } from "@/components/guidebooks/registry";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type Block } from "@/lib/guidebook-blocks";
import { TEAMS } from "@/lib/teams";

import { BlockEditor } from "./BlockEditor";

// Reuses the same i18n keys as the guidebooks list's group headers
// (topicOnboarding, topicCollaboration, ...).
const TOPIC_LABEL_KEYS: Record<GuidebookTopic, string> = {
  onboarding: "topicOnboarding",
  collaboration: "topicCollaboration",
  "time-account": "topicTimeAccount",
  "it-workplace": "topicItWorkplace",
  management: "topicManagement",
};
const TOPICS = Object.keys(TOPIC_LABEL_KEYS) as GuidebookTopic[];

export interface GuidebookFormData {
  title: string;
  description: string;
  topic: GuidebookTopic;
  teams: string[];
  minRole: "manager" | "admin" | null;
  blocks: Block[];
}

/**
 * Shared form for both /guidebooks/new (create) and /guidebooks/[slug]/edit
 * (update) — the actual persistence differs per caller (create needs a
 * unique slug computed up front; edit already has a pageId), so this only
 * owns the fields + BlockEditor and hands a finished payload to `onSave`.
 */
export function GuidebookEditor({
  initial,
  onSave,
  saving,
  submitLabel,
}: {
  initial?: GuidebookFormData;
  onSave: (data: GuidebookFormData) => Promise<void>;
  saving: boolean;
  submitLabel: string;
}) {
  const t = useTranslations("Guidebooks");
  const tTeams = useTranslations("Teams");
  const handleError = useErrorHandler();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [topic, setTopic] = useState<GuidebookTopic>(initial?.topic ?? "it-workplace");
  const [teams, setTeams] = useState<string[]>(initial?.teams ?? []);
  const [minRole, setMinRole] = useState<"manager" | "admin" | "all">(initial?.minRole ?? "all");
  const [blocks, setBlocks] = useState<Block[]>(initial?.blocks ?? []);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const canSave = title.trim().length > 0 && description.trim().length > 0;

  function toggleTeam(id: string) {
    setTeams((prev) => (prev.includes(id) ? prev.filter((t2) => t2 !== id) : [...prev, id]));
  }

  async function submit() {
    if (!canSave) return;
    // Every image block needs an uploaded storageId before this can save —
    // a block still mid-upload (or never given a file) can't be persisted.
    if (blocks.some((b) => b.type === "image" && !b.storageId)) {
      toast.error(t("imageBlockIncomplete"));
      return;
    }
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        topic,
        teams,
        minRole: minRole === "all" ? null : minRole,
        blocks,
      });
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("pageTitleLabel")}
          </Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("pageTitlePlaceholder")}
            className="h-11 text-base font-medium"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("pageDescriptionLabel")}
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("pageDescriptionPlaceholder")}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("pageTopicLabel")}
            </Label>
            <Select value={topic} onValueChange={(v) => setTopic(v as GuidebookTopic)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOPICS.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {t(TOPIC_LABEL_KEYS[tp])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("pageMinRoleLabel")}
            </Label>
            <Select value={minRole} onValueChange={(v) => setMinRole(v as typeof minRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pageMinRoleEveryone")}</SelectItem>
                <SelectItem value="manager">{t("pageMinRoleManager")}</SelectItem>
                <SelectItem value="admin">{t("pageMinRoleAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("pageTeamsLabel")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("pageTeamsHint")}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            {TEAMS.map((team) => (
              <label
                key={team.id}
                className="flex cursor-pointer items-center gap-2 text-sm font-medium"
              >
                <Checkbox
                  checked={teams.includes(team.id)}
                  onCheckedChange={() => toggleTeam(team.id)}
                />
                {tTeams(team.labelKey)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("pageContentLabel")}
        </Label>
        <BlockEditor
          blocks={blocks}
          onChange={setBlocks}
          dragIndex={dragIndex}
          onDragIndexChange={setDragIndex}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={!canSave || saving}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
