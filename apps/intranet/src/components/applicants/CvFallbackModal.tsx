"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PdfViewer } from "@/components/applicants/pdf/PdfViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type ExtractedApplicantFields,
  useApplicantsApi,
} from "@/lib/applicants-api";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

type FieldKey =
  | "name"
  | "email"
  | "telefon"
  | "adresse"
  | "geburtsdatum"
  | "position"
  | "ausbildung"
  | "berufserfahrung"
  | "zusammenfassung";

const TEXT_FIELDS: FieldKey[] = [
  "name",
  "email",
  "telefon",
  "adresse",
  "geburtsdatum",
  "position",
];
const TEXTAREA_FIELDS: FieldKey[] = [
  "ausbildung",
  "berufserfahrung",
  "zusammenfassung",
];

const FIELD_LABEL_KEY: Record<FieldKey, string> = {
  name: "name",
  email: "email",
  telefon: "phone",
  adresse: "address",
  geburtsdatum: "birthDate",
  position: "position",
  ausbildung: "education",
  berufserfahrung: "experience",
  zusammenfassung: "summary",
};

export type CvFallbackFormState = Record<FieldKey, string> & {
  skills: string[];
};
type FormState = CvFallbackFormState;
type Origin = "pdf" | "manual";

export function blankCvFallbackForm(): FormState {
  return {
    name: "",
    email: "",
    telefon: "",
    adresse: "",
    geburtsdatum: "",
    position: "",
    ausbildung: "",
    berufserfahrung: "",
    zusammenfassung: "",
    skills: [],
  };
}

export interface CvFallbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "update";
  applicantId?: Id<"applicants">;
  file: File;
  initialValues: FormState;
  initialFromPdfFields?: (FieldKey | "skills")[];
  pendingStorageId?: Id<"_storage">;
  onSaved: (applicantId: Id<"applicants">) => void;
}

function FillableField({
  label,
  value,
  origin,
  focused,
  multiline,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  origin: Origin | undefined;
  focused: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const t = useTranslations("Applicants");
  const Field = multiline ? Textarea : Input;
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {origin === "pdf" && (
          <span
            title={t("filledFromPdf")}
            className="inline-flex items-center gap-0.5 rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-info"
          >
            <Sparkles className="size-2.5" />
            {t("filledFromPdf")}
          </span>
        )}
      </span>
      <Field
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        className={cn(
          multiline && "min-h-24",
          focused && "ring-2 ring-primary"
        )}
      />
    </label>
  );
}

export function CvFallbackModal({
  open,
  onOpenChange,
  mode,
  applicantId,
  file,
  initialValues,
  initialFromPdfFields,
  pendingStorageId: initialPendingStorageId,
  onSaved,
}: CvFallbackModalProps) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const isMobile = useIsMobile();
  console.warn("[CvFallbackModal] mounting", {
    mode,
    fileName: file.name,
    isMobile,
  });
  const applicantsApi = useApplicantsApi();
  const handleError = useErrorHandler();
  const createApplicant = useMutation(api.applicants.create);
  const updateApplicant = useMutation(api.applicants.update);
  const addDocument = useMutation(api.applicants.addDocument);
  const generateUploadUrl = useMutation(api.applicants.generateUploadUrl);

  const [form, setForm] = useState<FormState>(initialValues);
  const [origins, setOrigins] = useState<
    Partial<Record<FieldKey | "skills", Origin>>
  >(() => {
    const initial: Partial<Record<FieldKey | "skills", Origin>> = {};
    for (const key of initialFromPdfFields ?? []) initial[key] = "pdf";
    return initial;
  });
  const [focusedField, setFocusedField] = useState<FieldKey | "skills" | null>(
    null
  );
  const [skillInput, setSkillInput] = useState("");
  const [pendingStorageId, setPendingStorageId] = useState<
    Id<"_storage"> | undefined
  >(initialPendingStorageId);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageHasNoText, setPageHasNoText] = useState(false);
  const [selectionHintShown, setSelectionHintShown] = useState(false);

  function setField(key: FieldKey, value: string, origin: Origin) {
    setForm(prev => ({ ...prev, [key]: value }));
    setOrigins(prev => ({ ...prev, [key]: origin }));
  }

  function handleTextSelected(text: string) {
    if (!focusedField) {
      setSelectionHintShown(true);
      return;
    }
    if (focusedField === "skills") {
      const items = text
        .split(/[,;\n]/)
        .map(s => s.trim())
        .filter(Boolean);
      if (items.length) {
        setForm(prev => ({ ...prev, skills: items }));
        setOrigins(prev => ({ ...prev, skills: "pdf" }));
      }
      return;
    }
    setField(focusedField, text, "pdf");
  }

  function applyExtracted(extracted: ExtractedApplicantFields) {
    setForm(prev => {
      const next = { ...prev };
      const newOrigins: Partial<Record<FieldKey | "skills", Origin>> = {};
      for (const key of TEXT_FIELDS.concat(TEXTAREA_FIELDS)) {
        const value = extracted[key as keyof ExtractedApplicantFields];
        if (typeof value === "string" && value.trim()) {
          next[key] = value;
          newOrigins[key] = "pdf";
        }
      }
      if (extracted.skills.length > 0) {
        next.skills = extracted.skills;
        newOrigins.skills = "pdf";
      }
      setOrigins(o => ({ ...o, ...newOrigins }));
      return next;
    });
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      if (mode === "create") {
        const result = await applicantsApi.extract(file);
        if (result.kind === "created") {
          toast.success(t("uploadSuccess", { name: file.name }));
          onSaved(result.applicantId);
          return;
        }
        applyExtracted(result.extractedFields);
        setPendingStorageId(result.pendingStorageId);
      } else {
        const result = await applicantsApi.rescan(file);
        applyExtracted(result.extractedFields);
        setPendingStorageId(result.storageId);
      }
    } catch (e) {
      handleError(e);
    } finally {
      setRetrying(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fields = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        telefon: form.telefon.trim() || undefined,
        adresse: form.adresse.trim() || undefined,
        geburtsdatum: form.geburtsdatum.trim() || undefined,
        position: form.position.trim() || undefined,
        skills: form.skills,
        ausbildung: form.ausbildung.trim() || undefined,
        berufserfahrung: form.berufserfahrung.trim() || undefined,
        zusammenfassung: form.zusammenfassung.trim() || undefined,
      };
      const storageId =
        pendingStorageId ??
        (await uploadToConvex(() => generateUploadUrl(), file));

      if (mode === "create") {
        const newApplicantId = await createApplicant(fields);
        await addDocument({
          applicantId: newApplicantId,
          storageId,
          fileName: file.name,
        });
        toast.success(t("applicantCreatedManually"));
        onSaved(newApplicantId);
      } else {
        if (!applicantId) return;
        await updateApplicant({ applicantId, ...fields });
        await addDocument({ applicantId, storageId, fileName: file.name });
        toast.success(t("applicantUpdatedFromRescan"));
        onSaved(applicantId);
      }
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  }

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-0 p-0">
          <div className="border-b border-border/70 px-6 pb-4 pt-6">
            <DialogTitle>{t("fallbackModalTitle")}</DialogTitle>
          </div>
          <div className="px-6 py-5">
            <DialogDescription>{t("fallbackDesktopOnly")}</DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[92vw] max-w-[1400px] flex-col gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pt-6 pr-12">
          <DialogTitle>
            {mode === "create"
              ? t("fallbackModalTitle")
              : t("fallbackModalTitleUpdate")}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {t("fallbackModalDescription")}
          </DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-border/70 p-5 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRetry()}
                disabled={retrying}
              >
                {retrying ? t("retrying") : t("retryExtraction")}
              </Button>

              {pageHasNoText && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {t("noSelectableText")}
                </p>
              )}
              {selectionHintShown && !focusedField && (
                <p className="text-xs text-muted-foreground">
                  {t("selectFieldFirstHint")}
                </p>
              )}

              {TEXT_FIELDS.map(key => (
                <FillableField
                  key={key}
                  label={t(FIELD_LABEL_KEY[key])}
                  value={form[key]}
                  origin={origins[key]}
                  focused={focusedField === key}
                  onChange={v => setField(key, v, "manual")}
                  onFocus={() => setFocusedField(key)}
                />
              ))}

              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("skills")}
                  {origins.skills === "pdf" && (
                    <span
                      title={t("filledFromPdf")}
                      className="inline-flex items-center gap-0.5 rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-info"
                    >
                      <Sparkles className="size-2.5" />
                      {t("filledFromPdf")}
                    </span>
                  )}
                </span>
                <div
                  className={cn(
                    "flex gap-2 rounded-md",
                    focusedField === "skills" && "ring-2 ring-primary"
                  )}
                >
                  <Input
                    value={skillInput}
                    onFocus={() => setFocusedField("skills")}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const items = skillInput
                        .split(/[,;\n]/)
                        .map(s => s.trim())
                        .filter(Boolean);
                      if (!items.length) return;
                      setForm(prev => ({
                        ...prev,
                        skills: [...new Set([...prev.skills, ...items])],
                      }));
                      setOrigins(prev => ({ ...prev, skills: "manual" }));
                      setSkillInput("");
                    }}
                    placeholder={t("skillsPlaceholder")}
                  />
                </div>
                {form.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.skills.map(s => (
                      <Badge key={s} variant="muted" className="gap-1.5 pr-1.5">
                        {s}
                        <button
                          type="button"
                          aria-label={t("removeSkill", { skill: s })}
                          onClick={() =>
                            setForm(prev => ({
                              ...prev,
                              skills: prev.skills.filter(x => x !== s),
                            }))
                          }
                          className="rounded-full px-1 text-muted-foreground hover:bg-background"
                        >
                          ✕
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {TEXTAREA_FIELDS.map(key => (
                <FillableField
                  key={key}
                  label={t(FIELD_LABEL_KEY[key])}
                  value={form[key]}
                  origin={origins[key]}
                  focused={focusedField === key}
                  multiline
                  onChange={v => setField(key, v, "manual")}
                  onFocus={() => setFocusedField(key)}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0">
            <PdfViewer
              file={file}
              onTextSelected={handleTextSelected}
              onPageHasNoText={setPageHasNoText}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
          >
            {saving ? t("uploading") : t("saveManualEntry")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
