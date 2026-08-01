"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatFileSize } from "@/lib/upload";

interface ExistingFile {
  id: string;
  name: string;
  size: number;
  storageId: Id<"_storage">;
}

interface Einwand {
  einwand: string;
  antwort: string;
}

interface Weg {
  name: string;
  einwaende: Einwand[];
  benefit: string;
  ziele: string;
}

export interface ProjectFormValue {
  titel: string;
  start: string;
  einstiegssatz: string;
  benefits: string[];
  ziele: string[];
  sfInput: string;
  wege: Weg[];
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
    wege: [],
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

function WegEditor({
  weg,
  index,
  onChange,
  onRemove,
  t,
}: {
  weg: Weg;
  index: number;
  onChange: (weg: Weg) => void;
  onRemove: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const setEinwand = (i: number, field: keyof Einwand, value: string) => {
    const einwaende = weg.einwaende.map((e, ei) => (ei === i ? { ...e, [field]: value } : e));
    onChange({ ...weg, einwaende });
  };
  return (
    <div className="mb-4 rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("weg", { n: index + 1 })}</h3>
        <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
          {t("wegEntfernen")}
        </Button>
      </div>
      <Label className="mb-1.5 mt-2 block">{t("wegName")}</Label>
      <Input
        value={weg.name}
        onChange={(e) => onChange({ ...weg, name: e.target.value })}
        placeholder={t("wegNamePlaceholder")}
      />
      <Label className="mb-1.5 mt-3 block">{t("einwaendeAntworten")}</Label>
      {weg.einwaende.map((e, ei) => (
        <div key={ei} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={e.einwand}
            onChange={(ev) => setEinwand(ei, "einwand", ev.target.value)}
            placeholder={t("einwandPlaceholder")}
          />
          <Input
            value={e.antwort}
            onChange={(ev) => setEinwand(ei, "antwort", ev.target.value)}
            placeholder={t("antwortPlaceholder")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("remove")}
            onClick={() =>
              onChange({ ...weg, einwaende: weg.einwaende.filter((_, i) => i !== ei) })
            }
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ ...weg, einwaende: [...weg.einwaende, { einwand: "", antwort: "" }] })
        }
      >
        <Plus className="size-3.5" />
        {t("einwandHinzufuegen")}
      </Button>
      <Label className="mb-1.5 mt-3 block">{t("wegBenefit")}</Label>
      <Textarea
        value={weg.benefit}
        onChange={(e) => onChange({ ...weg, benefit: e.target.value })}
        placeholder={t("wegBenefitPlaceholder")}
      />
      <Label className="mb-1.5 mt-3 block">{t("wegZiele")}</Label>
      <Textarea
        value={weg.ziele}
        onChange={(e) => onChange({ ...weg, ziele: e.target.value })}
        placeholder={t("wegZielePlaceholder")}
      />
    </div>
  );
}

export function ProjectForm({
  open,
  projectId,
  initial,
  onSaved,
  onCancel,
}: {
  open: boolean;
  projectId: Id<"salesCockpitProjects"> | null;
  initial: ProjectFormValue;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("SalesCockpit");
  const handleError = useErrorHandler();
  const createProject = useMutation(api.salesCockpit.createProject);
  const updateProject = useMutation(api.salesCockpit.updateProject);

  const [value, setValue] = useState<ProjectFormValue>(initial);
  const [saving, setSaving] = useState(false);

  const planUpload = useAttachmentUpload();
  const scripteUpload = useAttachmentUpload();
  const dateienUpload = useAttachmentUpload();

  // The dialog stays mounted while closed (so close transitions can play),
  // so opening it again for the same project needs an explicit reset —
  // otherwise a cancelled draft would resurface on the next open.
  useEffect(() => {
    if (!open) return;
    setValue(initial);
    planUpload.reset();
    scripteUpload.reset();
    dateienUpload.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

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
      const args = {
        titel: value.titel,
        start: value.start || undefined,
        einstiegssatz: value.einstiegssatz || undefined,
        benefits: value.benefits,
        ziele: value.ziele,
        sfInput: value.sfInput || undefined,
        wege: value.wege
          .filter((w) => w.name.trim())
          .map((w) => ({
            name: w.name,
            einwaende: w.einwaende.filter((e) => e.einwand.trim() || e.antwort.trim()),
            benefit: w.benefit || undefined,
            ziele: w.ziele || undefined,
          })),
        files: {
          plan: [
            ...value.files.plan.map((f) => ({
              storageId: f.storageId,
              name: f.name,
              size: f.size,
            })),
            ...plan.map((f) => ({ storageId: f.storageId, name: f.name, size: f.size ?? 0 })),
          ],
          scripte: [
            ...value.files.scripte.map((f) => ({
              storageId: f.storageId,
              name: f.name,
              size: f.size,
            })),
            ...scripte.map((f) => ({ storageId: f.storageId, name: f.name, size: f.size ?? 0 })),
          ],
          dateien: [
            ...value.files.dateien.map((f) => ({
              storageId: f.storageId,
              name: f.name,
              size: f.size,
            })),
            ...dateien.map((f) => ({ storageId: f.storageId, name: f.name, size: f.size ?? 0 })),
          ],
        },
      };
      if (projectId) {
        await updateProject({ projectId, ...args });
      } else {
        await createProject(args);
      }
      toast.success(t("projektGespeichert"));
      onSaved();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title={projectId ? t("projektBearbeiten") : t("neuesProjektAnlegen")}
      contentClassName="max-w-3xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("abbrechen")}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={
              saving || planUpload.uploading || scripteUpload.uploading || dateienUpload.uploading
            }
          >
            {t("projektSpeichern")}
          </Button>
        </>
      }
    >
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

      <div>
        <Label className="mb-1.5 block">{t("einstiegssatz")}</Label>
        <Textarea
          value={value.einstiegssatz}
          onChange={(e) => setValue({ ...value, einstiegssatz: e.target.value })}
          placeholder={t("einstiegssatzPlaceholder")}
        />
      </div>

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
          onRemove={(i) => setValue({ ...value, ziele: value.ziele.filter((_, zi) => zi !== i) })}
          placeholder={t("zielPlaceholder")}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>{t("wege")}</Label>
        </div>
        <p className="mb-2.5 text-xs text-muted-foreground">{t("wegeHint")}</p>
        {value.wege.map((w, i) => (
          <WegEditor
            key={i}
            weg={w}
            index={i}
            onChange={(next) =>
              setValue({ ...value, wege: value.wege.map((x, xi) => (xi === i ? next : x)) })
            }
            onRemove={() => setValue({ ...value, wege: value.wege.filter((_, xi) => xi !== i) })}
            t={t}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setValue({
              ...value,
              wege: [...value.wege, { name: "", einwaende: [], benefit: "", ziele: "" }],
            })
          }
        >
          <Plus className="size-3.5" />
          {t("wegHinzufuegen")}
        </Button>
      </div>

      <div>
        <Label className="mb-1.5 block">{t("sfInputLabel")}</Label>
        <Textarea
          value={value.sfInput}
          onChange={(e) => setValue({ ...value, sfInput: e.target.value })}
          placeholder={t("sfInputPlaceholder")}
        />
      </div>
    </ResponsiveDialog>
  );
}
