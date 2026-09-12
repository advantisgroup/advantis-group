"use client";

import { type UIEvent, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { ArrowLeft, FileText, Loader2, Pencil, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiButton } from "@/components/ai/AiButton";
import { AiGlyph } from "@/components/ai/AiGlyph";
import { aiErrorKey } from "@/components/ai/AiRunCard";
import { parseJson, useAiRun } from "@/components/ai/use-ai-run";
import {
  type ApplicantDetail,
  ensureRichHtml,
  RICH_CV_FIELDS,
  textToHtml,
} from "@/components/applicants/applicant-types";
import { DraftIndicator, DraftOfferBanner } from "@/components/compose/DraftIndicator";
import { MobileActionBar } from "@/components/compose/MobileActionBar";
import { ReadinessSubmit } from "@/components/compose/ReadinessSubmit";
import { useDraft } from "@/components/compose/use-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { htmlToText } from "@/components/ui/rich-text";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type CvExtractOutput,
  type CvRescanOutput,
  type ExtractedApplicantFields,
  useApplicantsApi,
} from "@/lib/applicants-api";
import { cvImportFiles } from "@/lib/cv-import-files";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

const PdfViewer = dynamic(
  () => import("@/components/applicants/pdf/PdfViewer").then((mod) => mod.PdfViewer),
  { ssr: false },
);

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

export type CvReviewValues = Record<FieldKey, string> & {
  skills: string[];
};
type Origin = "pdf" | "manual";
export type CvReviewOrigins = Partial<Record<FieldKey | "skills", Origin>>;

export function blankCvReviewValues(): CvReviewValues {
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

export function applicantToCvValues(applicant: ApplicantDetail): CvReviewValues {
  return {
    name: applicant.name,
    email: applicant.email ?? "",
    telefon: applicant.telefon ?? "",
    adresse: applicant.adresse ?? "",
    geburtsdatum: applicant.geburtsdatum ?? "",
    position: applicant.position ?? "",
    ausbildung: ensureRichHtml(applicant.ausbildung ?? ""),
    berufserfahrung: ensureRichHtml(applicant.berufserfahrung ?? ""),
    zusammenfassung: ensureRichHtml(applicant.zusammenfassung ?? ""),
    skills: applicant.skills,
  };
}

export interface CvFieldProposal {
  key: FieldKey | "skills";
  /** What the form holds right now, as plain text. */
  current: string;
  /** What the read suggests, as plain text. */
  proposed: string;
  /** What to write when it's accepted — HTML for rich fields, a list for skills. */
  value: string | string[];
}

/**
 * Lays what a CV read found over `base`, marking which fields came from the
 * PDF — but never over the top of text that is already there. A read that
 * would replace something comes back as a proposal instead, for a person to
 * accept or keep, so a rescan can't quietly undo someone's corrections.
 */
export function withExtracted(base: CvReviewValues, extracted: ExtractedApplicantFields) {
  const values = { ...base };
  const origins: CvReviewOrigins = {};
  const proposals: CvFieldProposal[] = [];

  for (const key of TEXT_FIELDS.concat(TEXTAREA_FIELDS, RICH_FIELDS)) {
    const value = extracted[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const rich = RICH_FIELDS.includes(key);
    const next = rich ? textToHtml(value) : value;
    const current = rich ? htmlToText(base[key]) : base[key];
    if (!current.trim()) {
      values[key] = next;
      origins[key] = "pdf";
      continue;
    }
    if (current.trim() === value.trim()) continue;
    proposals.push({ key, current: current.trim(), proposed: value.trim(), value: next });
  }

  if (extracted.skills.length > 0) {
    if (base.skills.length === 0) {
      values.skills = extracted.skills;
      origins.skills = "pdf";
    } else {
      const missing = extracted.skills.filter((skill) => !base.skills.includes(skill));
      if (missing.length > 0) {
        proposals.push({
          key: "skills",
          current: base.skills.join(", "),
          proposed: [...base.skills, ...missing].join(", "),
          value: [...base.skills, ...missing],
        });
      }
    }
  }

  return { values, origins, proposals };
}

export interface CvReviewFormProps {
  mode: "create" | "update";
  applicantId?: Id<"applicants">;
  file: File;
  initialValues: CvReviewValues;
  initialOrigins?: CvReviewOrigins;
  /** Fields the first read wanted to change but didn't, because something was
   * already there — offered for review instead of applied. */
  initialProposals?: CvFieldProposal[];
  pendingStorageId?: Id<"_storage">;
  /** Keeps typed-in work across a refresh — only worth it when the PDF can come back too. */
  draftKey?: string;
  backHref: string;
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

/** The CV on one side, the applicant's details on the other — select text in
 * the PDF to fill whichever field has focus. */
export function CvReviewForm({
  mode,
  applicantId,
  file,
  initialValues,
  initialOrigins,
  initialProposals,
  pendingStorageId: initialPendingStorageId,
  draftKey,
  backHref,
  onSaved,
}: CvReviewFormProps) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const ta = useTranslations("Ai");
  const isMobile = useIsMobile();
  const applicantsApi = useApplicantsApi();
  const handleError = useErrorHandler();
  const createApplicant = useMutation(api.applicants.create);
  const updateApplicant = useMutation(api.applicants.update);
  const addDocument = useMutation(api.applicants.addDocument);
  const generateUploadUrl = useMutation(api.applicants.generateUploadUrl);

  const [form, setForm] = useState<CvReviewValues>(initialValues);
  const [origins, setOrigins] = useState<CvReviewOrigins>(initialOrigins ?? {});
  const [proposals, setProposals] = useState<CvFieldProposal[]>(initialProposals ?? []);
  const [focusedField, setFocusedField] = useState<FieldKey | "skills" | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [pendingStorageId, setPendingStorageId] = useState<Id<"_storage"> | undefined>(
    initialPendingStorageId,
  );
  const [retryRunId, setRetryRunId] = useState<Id<"aiRuns"> | null>(null);
  const [startingRetry, setStartingRetry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageHasNoText, setPageHasNoText] = useState(false);
  const [selectionHintShown, setSelectionHintShown] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [mobilePage, setMobilePage] = useState<0 | 1>(0);

  const draftValue = useMemo(() => ({ form, origins }), [form, origins]);
  const draft = useDraft({
    surface: "cvReview",
    subjectKey: draftKey ?? "",
    enabled: !!draftKey,
    value: draftValue,
    onRestore: (stored) => {
      setForm(stored.form);
      setOrigins(stored.origins);
    },
  });

  const retryRun = useAiRun<CvExtractOutput | CvRescanOutput>({ runId: retryRunId }, parseJson);
  const retrying = startingRetry || retryRun.state === "working";

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
    } else {
      const value = RICH_FIELDS.includes(focusedField) ? textToHtml(text) : text;
      setField(focusedField, value, "pdf");
    }
    if (isMobile) scrollToPage(0);
  }

  function applyExtracted(extracted: ExtractedApplicantFields) {
    const next = withExtracted(form, extracted);
    setForm(next.values);
    setOrigins((prev) => ({ ...prev, ...next.origins }));
    setProposals(next.proposals);
  }

  function acceptProposal(proposal: CvFieldProposal) {
    if (proposal.key === "skills") {
      setForm((prev) => ({ ...prev, skills: proposal.value as string[] }));
      setOrigins((prev) => ({ ...prev, skills: "pdf" }));
    } else {
      setField(proposal.key, proposal.value as string, "pdf");
    }
    setProposals((prev) => prev.filter((row) => row.key !== proposal.key));
  }

  function keepProposal(proposal: CvFieldProposal) {
    setProposals((prev) => prev.filter((row) => row.key !== proposal.key));
  }

  function discardChanges() {
    const baseline = { form: initialValues, origins: initialOrigins ?? {} };
    setForm(baseline.form);
    setOrigins(baseline.origins);
    void draft.clear(baseline);
  }

  async function handleRetry() {
    setStartingRetry(true);
    try {
      const { runId } =
        mode === "create"
          ? await applicantsApi.startExtract(file)
          : await applicantsApi.startRescan(file, applicantId as Id<"applicants">);
      cvImportFiles.set(runId, file);
      setRetryRunId(runId as Id<"aiRuns">);
    } catch (e) {
      handleError(e);
    } finally {
      setStartingRetry(false);
    }
  }

  // The retry is a run like any other; this form just waits on it and folds
  // what it read back in. In create mode a clean read creates the applicant
  // server-side, so there's nothing left to fill in.
  useEffect(() => {
    if (!retryRunId) return;
    if (retryRun.state === "done" && retryRun.result) {
      const result = retryRun.result;
      retryRun.markSeen();
      setRetryRunId(null);
      if ("kind" in result) {
        if (result.kind === "created") {
          void draft.clear();
          toast.success(t("uploadSuccess", { name: file.name }));
          onSaved(result.applicantId);
          return;
        }
        applyExtracted(result.extractedFields);
        setPendingStorageId(result.pendingStorageId);
      } else {
        applyExtracted(result.extractedFields);
        setPendingStorageId(result.storageId);
      }
    } else if (
      retryRun.state === "error" ||
      retryRun.state === "interrupted" ||
      retryRun.state === "cancelled"
    ) {
      toast.error(ta(aiErrorKey(retryRun.run?.errorCode ?? null)));
      retryRun.markSeen();
      setRetryRunId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryRunId, retryRun.state, retryRun.result]);

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
        await draft.clear();
        toast.success(t("applicantCreatedManually"));
        onSaved(newApplicantId);
      } else {
        if (!applicantId) return;
        await updateApplicant({ applicantId, ...fields });
        await addDocument({ applicantId, storageId, fileName: file.name });
        await draft.clear();
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
        <DraftOfferBanner draft={draft} />

        {proposals.length > 0 && (
          <section
            className="rounded-2xl border border-border/60 p-4"
            style={{
              backgroundColor: "var(--card)",
              backgroundImage:
                "radial-gradient(26rem 10rem at 0% 0%, color-mix(in oklch, var(--ai-2) 14%, transparent), transparent 70%)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span className="ai-edge flex size-8 items-center justify-center rounded-lg">
                <AiGlyph className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] refreshed:text-xs refreshed:normal-case refreshed:tracking-normal">
                  <span className="ai-text">{ta("eyebrow")}</span>
                </p>
                <h3 className="font-display text-base font-bold tracking-tight refreshed:font-semibold">
                  {t("cvProposalsTitle", { count: proposals.length })}
                </h3>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("cvProposalsHint")}</p>
            <ul className="mt-2 divide-y divide-border/60">
              {proposals.map((proposal, index) => (
                <li
                  key={proposal.key}
                  className="ai-rise space-y-1.5 py-2.5"
                  style={{ ["--i" as string]: index }}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {proposal.key === "skills" ? t("skills") : t(FIELD_LABEL_KEY[proposal.key])}
                  </p>
                  <p className="text-xs text-muted-foreground line-through">{proposal.current}</p>
                  <p className="text-sm">{proposal.proposed}</p>
                  <div className="flex justify-end gap-2">
                    <Button size="xs" variant="ghost" onClick={() => keepProposal(proposal)}>
                      {t("cvProposalKeep")}
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => acceptProposal(proposal)}>
                      {t("cvProposalApply")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setProposals([])}>
                {t("cvProposalKeepAll")}
              </Button>
              <Button size="sm" onClick={() => proposals.forEach(acceptProposal)}>
                {t("cvProposalApplyAll")}
              </Button>
            </div>
          </section>
        )}
        <p className="text-sm text-muted-foreground">
          {isMobile ? t("fallbackModalDescriptionMobile") : t("fallbackModalDescription")}
        </p>
        <AiButton working={retrying} disabled={retrying} onClick={() => void handleRetry()}>
          {retrying ? t("retrying") : t("retryExtraction")}
        </AiButton>

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
          <FillableFieldLabel label={t("skills")} origin={origins.skills} />
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

  const pdf = (
    <PdfViewer file={file} onTextSelected={handleTextSelected} onPageHasNoText={setPageHasNoText} />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 md:px-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref} aria-label={tc("back")}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {mode === "create" ? t("fallbackModalTitle") : t("fallbackModalTitleUpdate")}
          </p>
          {draft.savedAt !== null || draft.status !== "idle" ? (
            <DraftIndicator draft={draft} onDiscard={discardChanges} />
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">{file.name}</p>
          )}
        </div>
        {!isMobile && (
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
          >
            {saving && <Loader2 className="animate-spin" />}
            {saving ? t("uploading") : t("saveManualEntry")}
          </Button>
        )}
      </header>

      {isMobile ? (
        <>
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="h-full w-full shrink-0 snap-center overflow-y-auto p-4">
              {renderFormFields()}
            </div>
            <div className="flex h-full w-full shrink-0 snap-center flex-col">
              <p className="shrink-0 truncate border-b border-border/70 px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                {focusedField
                  ? t("cvReviewTapToFill", {
                      field: t(
                        focusedField === "skills" ? "skills" : FIELD_LABEL_KEY[focusedField],
                      ),
                    })
                  : t("selectFieldFirstHint")}
              </p>
              <div className="min-h-0 flex-1">{pdf}</div>
            </div>
          </div>
          <MobileActionBar inline>
            <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
              {([0, 1] as const).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => scrollToPage(page)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    mobilePage === page ? "bg-foreground text-background" : "text-muted-foreground",
                  )}
                >
                  {page === 0 ? <Pencil className="size-3.5" /> : <FileText className="size-3.5" />}
                  {page === 0 ? t("fallbackPageForm") : t("fallbackPagePdf")}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <ReadinessSubmit
              checks={[{ key: "name", label: t("name"), done: !!form.name.trim() }]}
              busy={saving}
              onSubmit={() => void handleSave()}
            >
              {t("saveManualEntry")}
            </ReadinessSubmit>
          </MobileActionBar>
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,440px)_1fr]">
          <div className="min-h-0 overflow-y-auto border-r border-border/70 p-5">
            {renderFormFields()}
          </div>
          <div className="min-h-0">{pdf}</div>
        </div>
      )}
    </div>
  );
}
