"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ExternalLink, Plus, Workflow, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { Link } from "@/components/Link";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatFileSize } from "@/lib/upload";

const NO_FLOW_VALUE = "__none__";
const PROJECTS_HREF = "/sales-cockpit/projekte";

interface ExistingFile {
  id: string;
  name: string;
  size: number;
  storageId: Id<"_storage">;
}

export interface ProjectFormValue {
  titel: string;
  start: string;
  einstiegssatz: string;
  benefits: string[];
  ziele: string[];
  sfInput: string;
  flowId: Id<"salesCockpitFlows"> | undefined;
  files: { plan: ExistingFile[]; scripte: ExistingFile[]; dateien: ExistingFile[] };
}

export function blankProjectForm(): ProjectFormValue {
  return {
    titel: "",
    start: "",
    einstiegssatz: "",
    benefits: [],
    ziele: [],
    sfInput: "",
    flowId: undefined,
    files: { plan: [], scripte: [], dateien: [] },
  };
}

function ChipList({
  items,
  onRemove,
  onAdd,
  placeholder,
}: {
  items: string[];
  onRemove: (i: number) => void;
  onAdd: (value: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("SalesCockpit");
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="gap-1.5">
            {item}
            <button type="button" onClick={() => onRemove(i)} aria-label={t("remove")}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={submit}
          aria-label={placeholder}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function FileCategoryEditor({
  label,
  hint,
  existing,
  onRemoveExisting,
  upload,
}: {
  label: string;
  hint?: string;
  existing: ExistingFile[];
  onRemoveExisting: (id: string) => void;
  upload: ReturnType<typeof useAttachmentUpload>;
}) {
  const t = useTranslations("SalesCockpit");
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <input
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) upload.add(Array.from(e.target.files));
          e.target.value = "";
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-col gap-1.5">
        {existing.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatFileSize(f.size)}
            </span>
            <button
              type="button"
              onClick={() => onRemoveExisting(f.id)}
              className="text-destructive"
              aria-label={t("remove")}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {upload.entries.map((entry, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{entry.file.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatFileSize(entry.file.size)}
            </span>
            <button
              type="button"
              onClick={() => upload.remove(i)}
              className="text-destructive"
              aria-label={t("remove")}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Link an existing Flow (built on the Flows tab) or spin up a new one without
 *  leaving the project. Creating a flow here is a real, immediately-persisted
 *  `salesCockpitFlows` row (not part of the project's own draft state) — the
 *  "Open flow editor" link opens in a new tab precisely so that doesn't cost
 *  the user their in-progress project edits. */
function FlowLinkSection({
  flowId,
  onChange,
  projectTitel,
}: {
  flowId: Id<"salesCockpitFlows"> | undefined;
  onChange: (flowId: Id<"salesCockpitFlows"> | undefined) => void;
  projectTitel: string;
}) {
  const t = useTranslations("SalesCockpit");
  const handleError = useErrorHandler();
  const flows = useQuery(api.salesCockpitFlows.listFlows);
  const createFlow = useMutation(api.salesCockpitFlows.createFlow);
  const [creating, setCreating] = useState(false);

  const linked = flows?.find((f) => f._id === flowId);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await createFlow({ titel: projectTitel.trim() || t("flowTitelPlaceholder") });
      onChange(res.id);
    } catch (error) {
      handleError(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <Label className="mb-1.5 block">{t("flowVerknuepft")}</Label>
      <p className="mb-2.5 text-xs text-muted-foreground">{t("flowVerknuepftHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={flowId ?? NO_FLOW_VALUE}
          onValueChange={(v) =>
            onChange(v === NO_FLOW_VALUE ? undefined : (v as Id<"salesCockpitFlows">))
          }
        >
          <SelectTrigger className="w-auto min-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FLOW_VALUE}>{t("flowKeinFlow")}</SelectItem>
            {(flows ?? []).map((f) => (
              <SelectItem key={f._id} value={f._id}>
                {f.titel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleCreate()}
          disabled={creating}
        >
          <Plus className="size-3.5" />
          {t("neuerFlow")}
        </Button>
      </div>
      {linked && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
          <Workflow className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{linked.titel}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {t("flowKnoten", { n: linked.nodeCount })}
          </span>
          <Link
            href={`/sales-cockpit/flows/${linked._id}`}
            target="_blank"
            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {t("flowEditorOeffnen")}
            <ExternalLink className="size-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function ProjectForm({
  projectId,
  initial,
  entitySavedAt,
}: {
  projectId: Id<"salesCockpitProjects"> | null;
  initial: ProjectFormValue;
  /** When the project was last saved, so an older draft isn't offered over it. */
  entitySavedAt?: number;
}) {
  const t = useTranslations("SalesCockpit");
  const tc = useTranslations("Common");
  const router = useRouter();
  const handleError = useErrorHandler();
  const createProject = useMutation(api.salesCockpit.createProject);
  const updateProject = useMutation(api.salesCockpit.updateProject);

  const [value, setValue] = useState<ProjectFormValue>(initial);
  const [saving, setSaving] = useState(false);

  const planUpload = useAttachmentUpload();
  const scripteUpload = useAttachmentUpload();
  const dateienUpload = useAttachmentUpload();

  // Picked-but-not-uploaded files can't be kept in a draft; everything else is.
  const draft = useDraft<ProjectFormValue>({
    surface: "salesCockpitProject",
    subjectKey: projectId ?? "new",
    value,
    restore: projectId ? "offer" : "auto",
    entitySavedAt,
    isEmpty: (v) =>
      !projectId &&
      !v.titel.trim() &&
      !v.einstiegssatz.trim() &&
      !v.sfInput.trim() &&
      v.benefits.length === 0 &&
      v.ziele.length === 0,
    onRestore: (stored) => setValue({ ...blankProjectForm(), ...stored }),
  });

  function discardChanges() {
    setValue(initial);
    void draft.clear(initial);
  }

  const checks: ReadinessCheck[] = [
    { key: "titel", label: t("titel"), done: !!value.titel.trim() },
    { key: "start", label: t("start"), done: !!value.start, optional: true },
    {
      key: "einstiegssatz",
      label: t("einstiegssatz"),
      done: !!value.einstiegssatz.trim(),
      optional: true,
    },
    {
      key: "benefits",
      label: t("benefitsDerKampagne"),
      done: value.benefits.length > 0,
      optional: true,
    },
    { key: "ziele", label: t("zieleDerKampagne"), done: value.ziele.length > 0, optional: true },
  ];
  const uploading = planUpload.uploading || scripteUpload.uploading || dateienUpload.uploading;

  const removeExistingFile = (cat: "plan" | "scripte" | "dateien", id: string) => {
    setValue((v) => ({
      ...v,
      files: { ...v.files, [cat]: v.files[cat].filter((f) => f.id !== id) },
    }));
  };

  const submit = async () => {
    if (!value.titel.trim()) {
      toast.error(t("bitteTitel"));
      return;
    }
    setSaving(true);
    try {
      const [plan, scripte, dateien] = await Promise.all([
        planUpload.uploadAll(),
        scripteUpload.uploadAll(),
        dateienUpload.uploadAll(),
      ]);
      const toFileArg = (f: { storageId: Id<"_storage">; name: string; size?: number }) => ({
        storageId: f.storageId,
        name: f.name,
        size: f.size ?? 0,
      });
      const args = {
        titel: value.titel,
        start: value.start || undefined,
        einstiegssatz: value.einstiegssatz || undefined,
        benefits: value.benefits,
        ziele: value.ziele,
        sfInput: value.sfInput || undefined,
        flowId: value.flowId,
        files: {
          plan: [...value.files.plan, ...plan].map(toFileArg),
          scripte: [...value.files.scripte, ...scripte].map(toFileArg),
          dateien: [...value.files.dateien, ...dateien].map(toFileArg),
        },
      };
      if (projectId) {
        await updateProject({ projectId, ...args });
      } else {
        await createProject(args);
      }
      await draft.clear();
      toast.success(t("projektGespeichert"));
      router.push(PROJECTS_HREF);
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={PROJECTS_HREF}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("tabProjekte")}
        </Link>
        <h2 className="font-display text-lg font-bold tracking-tight">
          {projectId ? t("projektBearbeiten") : t("neuesProjektAnlegen")}
        </h2>
        <DraftIndicator draft={draft} onDiscard={discardChanges} className="ml-auto" />
      </div>

      <DraftOfferBanner draft={draft} />
      <DraftRestoredNote draft={draft} onStartOver={discardChanges} />

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">{t("titel")} *</Label>
              <Input
                value={value.titel}
                onChange={(e) => setValue({ ...value, titel: e.target.value })}
                placeholder={t("titelPlaceholder")}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t("start")}</Label>
              <Input
                type="date"
                value={value.start}
                onChange={(e) => setValue({ ...value, start: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">{t("einstiegssatz")}</Label>
            <Textarea
              value={value.einstiegssatz}
              onChange={(e) => setValue({ ...value, einstiegssatz: e.target.value })}
              placeholder={t("einstiegssatzPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">{t("benefitsDerKampagne")}</Label>
              <ChipList
                items={value.benefits}
                onAdd={(v) => setValue({ ...value, benefits: [...value.benefits, v] })}
                onRemove={(i) =>
                  setValue({ ...value, benefits: value.benefits.filter((_, bi) => bi !== i) })
                }
                placeholder={t("benefitPlaceholder")}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t("zieleDerKampagne")}</Label>
              <ChipList
                items={value.ziele}
                onAdd={(v) => setValue({ ...value, ziele: [...value.ziele, v] })}
                onRemove={(i) =>
                  setValue({ ...value, ziele: value.ziele.filter((_, zi) => zi !== i) })
                }
                placeholder={t("zielPlaceholder")}
              />
            </div>
          </div>

          <FlowLinkSection
            flowId={value.flowId}
            onChange={(flowId) => setValue({ ...value, flowId })}
            projectTitel={value.titel}
          />

          <div>
            <Label className="mb-1.5 block">{t("sfInputLabel")}</Label>
            <Textarea
              value={value.sfInput}
              onChange={(e) => setValue({ ...value, sfInput: e.target.value })}
              placeholder={t("sfInputPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FileCategoryEditor
              label={t("projektplanHochladen")}
              existing={value.files.plan}
              onRemoveExisting={(id) => removeExistingFile("plan", id)}
              upload={planUpload}
            />
            <FileCategoryEditor
              label={t("scripteHochladen")}
              existing={value.files.scripte}
              onRemoveExisting={(id) => removeExistingFile("scripte", id)}
              upload={scripteUpload}
            />
          </div>
          <FileCategoryEditor
            label={t("weitereDateienHochladen")}
            hint={t("uploadHint")}
            existing={value.files.dateien}
            onRemoveExisting={(id) => removeExistingFile("dateien", id)}
            upload={dateienUpload}
          />
        </CardContent>
      </Card>

      <MobileActionBar>
        <ReadinessMeter checks={checks} className="mr-auto" />
        <ReadinessSubmit
          checks={checks}
          busy={saving}
          disabled={uploading}
          onSubmit={() => void submit()}
        >
          {t("projektSpeichern")}
        </ReadinessSubmit>
      </MobileActionBar>
      <div className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-2 md:flex">
        <ReadinessMeter checks={checks} className="mr-auto" />
        <Button variant="secondary" asChild>
          <Link href={PROJECTS_HREF}>{tc("cancel")}</Link>
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={saving || uploading || !scoreReadiness(checks).canSubmit}
        >
          {t("projektSpeichern")}
        </Button>
      </div>
    </div>
  );
}
