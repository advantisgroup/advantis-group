"use client";

import { type UIEvent, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { FileText, Pencil, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { RICH_CV_FIELDS, textToHtml } from "@/components/applicants/applicant-types";
import { PdfViewer } from "@/components/applicants/pdf/PdfViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { type ExtractedApplicantFields, useApplicantsApi } from "@/lib/applicants-api";
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

const TEXT_FIELDS: FieldKey[] = ["name", "email", "telefon", "geburtsdatum", "position"];
/** Short, single-purpose field that still benefits from a couple of lines of room. */
const TEXTAREA_FIELDS: FieldKey[] = ["adresse"];
/** Long-form fields where the applicant's actual history/detail lives — these get
 * the same rich-text editor used for announcements, so multi-job, multi-line
 * content keeps its structure instead of collapsing into one flat line. */
const RICH_FIELDS: FieldKey[] = [...RICH_CV_FIELDS];

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

function FillableFieldLabel({ label, origin }: { label: string; origin: Origin | undefined }) {
  const t = useTranslations("Applicants");
  return (
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
  );
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
  const Field = multiline ? Textarea : Input;
  return (
    <label className="block space-y-1.5">
      <FillableFieldLabel label={label} origin={origin} />
      <Field
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className={cn(multiline && "min-h-20", focused && "ring-2 ring-primary")}
      />
    </label>
  );
}

/** Rich-text variant of `FillableField` — for the long-form CV fields
 * (education, experience, summary) where applicants need actual formatting
 * (paragraphs, lists) to record real detail rather than one flat line. */
function FillableRichField({
  label,
  value,
  origin,
  focused,
  placeholder,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  origin: Origin | undefined;
  focused: boolean;
  placeholder?: string;
  onChange: (html: string) => void;
  onFocus: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <FillableFieldLabel label={label} origin={origin} />
      <RichTextEditor
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        placeholder={placeholder}
        minHeight="min-h-28"
        className={cn(focused && "ring-2 ring-primary")}
      />
    </div>
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
  const applicantsApi = useApplicantsApi();
  const handleError = useErrorHandler();
  const createApplicant = useMutation(api.applicants.create);
  const updateApplicant = useMutation(api.applicants.update);
  const addDocument = useMutation(api.applicants.addDocument);
  const generateUploadUrl = useMutation(api.applicants.generateUploadUrl);

  const [form, setForm] = useState<FormState>(initialValues);
  const [origins, setOrigins] = useState<Partial<Record<FieldKey | "skills", Origin>>>(() => {
    const initial: Partial<Record<FieldKey | "skills", Origin>> = {};
    for (const key of initialFromPdfFields ?? []) initial[key] = "pdf";
    return initial;
  });
  const [focusedField, setFocusedField] = useState<FieldKey | "skills" | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [pendingStorageId, setPendingStorageId] = useState<Id<"_storage"> | undefined>(
    initialPendingStorageId,
  );
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageHasNoText, setPageHasNoText] = useState(false);
  const [selectionHintShown, setSelectionHintShown] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [mobilePage, setMobilePage] = useState<0 | 1>(0);

  function scrollToPage(page: 0 | 1) {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollTo({ left: page * el.clientWidth, behavior: "smooth" });
    setMobilePage(page);
  }

  function handleCarouselScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    const page = Math.round(el.scrollLeft / el.clientWidth) as 0 | 1;
    if (page !== mobilePage) setMobilePage(page);
  }

  function setField(key: FieldKey, value: string, origin: Origin) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setOrigins((prev) => ({ ...prev, [key]: origin }));
  }

  function handleTextSelected(text: string) {
    if (!focusedField) {
      setSelectionHintShown(true);
      return;
    }
    if (focusedField === "skills") {
      const items = text
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length) {
        setForm((prev) => ({ ...prev, skills: items }));
        setOrigins((prev) => ({ ...prev, skills: "pdf" }));
      }
      return;
    }
    const value = RICH_FIELDS.includes(focusedField) ? textToHtml(text) : text;
    setField(focusedField, value, "pdf");
  }

  function applyExtracted(extracted: ExtractedApplicantFields) {
    setForm((prev) => {
      const next = { ...prev };
      const newOrigins: Partial<Record<FieldKey | "skills", Origin>> = {};
      for (const key of TEXT_FIELDS.concat(TEXTAREA_FIELDS, RICH_FIELDS)) {
        const value = extracted[key as keyof ExtractedApplicantFields];
        if (typeof value === "string" && value.trim()) {
          next[key] = RICH_FIELDS.includes(key) ? textToHtml(value) : value;
          newOrigins[key] = "pdf";
        }
      }
      if (extracted.skills.length > 0) {
        next.skills = extracted.skills;
        newOrigins.skills = "pdf";
      }
      setOrigins((o) => ({ ...o, ...newOrigins }));
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
      const storageId = pendingStorageId ?? (await uploadToConvex(() => generateUploadUrl(), file));

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

  function renderFormFields() {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => void handleRetry()} disabled={retrying}>
          {retrying ? t("retrying") : t("retryExtraction")}
        </Button>

        {pageHasNoText && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            {t("noSelectableText")}
          </p>
        )}
        {selectionHintShown && !focusedField && (
          <p className="text-xs text-muted-foreground">{t("selectFieldFirstHint")}</p>
        )}

        {TEXT_FIELDS.map((key) => (
          <FillableField
            key={key}
            label={t(FIELD_LABEL_KEY[key])}
            value={form[key]}
            origin={origins[key]}
            focused={focusedField === key}
            onChange={(v) => setField(key, v, "manual")}
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
              focusedField === "skills" && "ring-2 ring-primary",
            )}
          >
            <Input
              value={skillInput}
              onFocus={() => setFocusedField("skills")}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const items = skillInput
                  .split(/[,;\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (!items.length) return;
                setForm((prev) => ({
                  ...prev,
                  skills: [...new Set([...prev.skills, ...items])],
                }));
                setOrigins((prev) => ({ ...prev, skills: "manual" }));
                setSkillInput("");
              }}
              placeholder={t("skillsPlaceholder")}
            />
          </div>
          {form.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.skills.map((s) => (
                <Badge key={s} variant="muted" className="gap-1.5 pr-1.5">
                  {s}
                  <button
                    type="button"
                    aria-label={t("removeSkill", { skill: s })}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        skills: prev.skills.filter((x) => x !== s),
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

        {TEXTAREA_FIELDS.map((key) => (
          <FillableField
            key={key}
            label={t(FIELD_LABEL_KEY[key])}
            value={form[key]}
            origin={origins[key]}
            focused={focusedField === key}
            multiline
            onChange={(v) => setField(key, v, "manual")}
            onFocus={() => setFocusedField(key)}
          />
        ))}

        {RICH_FIELDS.map((key) => (
          <FillableRichField
            key={key}
            label={t(FIELD_LABEL_KEY[key])}
            value={form[key]}
            origin={origins[key]}
            focused={focusedField === key}
            placeholder={t("richFieldPlaceholder")}
            onChange={(v) => setField(key, v, "manual")}
            onFocus={() => setFocusedField(key)}
          />
        ))}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[92vh] w-[95vw] max-w-md flex-col gap-0 p-0">
          <div className="border-b border-border/70 px-4 pb-3 pt-5 pr-12">
            <DialogTitle className="text-base leading-snug">
              {mode === "create" ? t("fallbackModalTitle") : t("fallbackModalTitleUpdate")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              {t("fallbackModalDescriptionMobile")}
            </DialogDescription>
          </div>

          <div className="flex items-center justify-center gap-1 border-b border-border/70 p-2">
            <button
              type="button"
              onClick={() => scrollToPage(0)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mobilePage === 0 ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <Pencil className="size-3.5" />
              {t("fallbackPageForm")}
            </button>
            <button
              type="button"
              onClick={() => scrollToPage(1)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mobilePage === 1 ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <FileText className="size-3.5" />
              {t("fallbackPagePdf")}
            </button>
          </div>

          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="h-full w-full shrink-0 snap-center overflow-y-auto p-4">
              {renderFormFields()}
            </div>
            <div className="h-full w-full shrink-0 snap-center">
              <PdfViewer
                file={file}
                onTextSelected={handleTextSelected}
                onPageHasNoText={setPageHasNoText}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button
              size="sm"
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[92vw] max-w-[1400px] flex-col gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pt-6 pr-12">
          <DialogTitle>
            {mode === "create" ? t("fallbackModalTitle") : t("fallbackModalTitleUpdate")}
          </DialogTitle>
          <DialogDescription className="mt-1">{t("fallbackModalDescription")}</DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-border/70 p-5 lg:border-b-0 lg:border-r">
            {renderFormFields()}
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
          <Button onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
            {saving ? t("uploading") : t("saveManualEntry")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
