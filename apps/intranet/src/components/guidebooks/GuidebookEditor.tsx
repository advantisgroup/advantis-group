"use client";

import { type ReactNode, useMemo, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  DraftIndicator,
  DraftOfferBanner,
  DraftRestoredNote,
} from "@/components/compose/DraftIndicator";
import {
  type ReadinessCheck,
  ReadinessMeter,
  scoreReadiness,
} from "@/components/compose/Readiness";
import { MobileActionBar } from "@/components/compose/MobileActionBar";
import { ReadinessSubmit } from "@/components/compose/ReadinessSubmit";
import { useDraft } from "@/components/compose/use-draft";
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

const BLANK_PAGE: GuidebookFormData = {
  title: "",
  description: "",
  topic: "it-workplace",
  teams: [],
  minRole: null,
  blocks: [],
};

/**
 * Shared form for both /guidebooks/new/advanced (create) and
 * /guidebooks/[slug]/edit (update) — the actual persistence differs per
 * caller (create needs a unique slug computed up front; edit already has a
 * pageId), so this only owns the fields + BlockEditor and hands a finished
 * payload to `onSave`.
 */
export function GuidebookEditor({
  initial,
  draftKey,
  entitySavedAt,
  onSave,
  saving,
  submitLabel,
  attachmentsSlot,
}: {
  initial?: GuidebookFormData;
  /** "new", or the page's id — where unsaved work waits between visits. */
  draftKey: string;
  /** When the page was last saved, so an older draft isn't offered over it. */
  entitySavedAt?: number;
  onSave: (data: GuidebookFormData) => Promise<void>;
  saving: boolean;
  submitLabel: string;
  /** Rendered between the content editor and the submit button — the "new
   *  page" flow slots in drag-and-drop attachment staging here, since a
   *  brand-new page has no slug yet to attach files to directly. */
  attachmentsSlot?: ReactNode;
}) {
  const t = useTranslations("Guidebooks");
  const tTeams = useTranslations("Teams");
  const handleError = useErrorHandler();
  const start = initial ?? BLANK_PAGE;

  const [title, setTitle] = useState(start.title);
  const [description, setDescription] = useState(start.description);
  const [topic, setTopic] = useState<GuidebookTopic>(start.topic);
  const [teams, setTeams] = useState<string[]>(start.teams);
  const [minRole, setMinRole] = useState<"manager" | "admin" | "all">(start.minRole ?? "all");
  const [blocks, setBlocks] = useState<Block[]>(start.blocks);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const value = useMemo<GuidebookFormData>(
    () => ({
      title,
      description,
      topic,
      teams,
      minRole: minRole === "all" ? null : minRole,
      blocks,
    }),
    [title, description, topic, teams, minRole, blocks],
  );

  function fill(data: GuidebookFormData) {
    setTitle(data.title);
    setDescription(data.description);
    setTopic(data.topic);
    setTeams(data.teams);
    setMinRole(data.minRole ?? "all");
    setBlocks(data.blocks);
  }

  const draft = useDraft<GuidebookFormData>({
    surface: "guidebookPage",
    subjectKey: draftKey,
    value,
    restore: initial ? "offer" : "auto",
    entitySavedAt,
    isEmpty: (v) => !initial && !v.title.trim() && !v.description.trim() && v.blocks.length === 0,
    onRestore: fill,
  });

  function discardChanges() {
    fill(start);
    void draft.clear(start);
  }

  const checks: ReadinessCheck[] = [
    { key: "title", label: t("pageTitleLabel"), done: title.trim().length > 0 },
    { key: "description", label: t("pageDescriptionLabel"), done: description.trim().length > 0 },
    { key: "content", label: t("pageContentLabel"), done: blocks.length > 0, optional: true },
  ];
  const canSave = scoreReadiness(checks).canSubmit;

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
      await onSave({ ...value, title: title.trim(), description: description.trim() });
      await draft.clear();
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="space-y-6">
      <DraftOfferBanner draft={draft} />
      <DraftRestoredNote
        draft={draft}
        onStartOver={discardChanges}
        filesNotKept={!!attachmentsSlot}
      />

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

      {attachmentsSlot}

      <MobileActionBar>
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <ReadinessMeter checks={checks} />
          <DraftIndicator draft={draft} onDiscard={discardChanges} />
        </div>
        <ReadinessSubmit checks={checks} busy={saving} onSubmit={() => void submit()}>
          {submitLabel}
        </ReadinessSubmit>
      </MobileActionBar>
      <div className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-2 md:flex">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <ReadinessMeter checks={checks} />
          <DraftIndicator draft={draft} onDiscard={discardChanges} />
        </div>
        <Button onClick={() => void submit()} disabled={!canSave || saving}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
