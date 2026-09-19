"use client";

import { type ReactNode, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { ArrowLeft, Check, FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { AiRunCard } from "@/components/ai/AiRunCard";
import { parseJson, useAiRun } from "@/components/ai/use-ai-run";
import {
  DraftIndicator,
  DraftOfferBanner,
  DraftRestoredNote,
} from "@/components/compose/DraftIndicator";
import { MobileActionBar } from "@/components/compose/MobileActionBar";
import { type ReadinessCheck, ReadinessCard, ReadinessMeter } from "@/components/compose/Readiness";
import { ReadinessSubmit } from "@/components/compose/ReadinessSubmit";
import { useDraft } from "@/components/compose/use-draft";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import { useEdenApi } from "@/lib/eden";
import {
  createWikiArticle,
  deleteWikiArticle,
  startWikiExtraction,
  updateWikiArticle,
  type WikiDocumentExtraction,
} from "@/lib/sales-coach-ev-api";
import { formatFileSize, uploadToConvex } from "@/lib/upload";

import { WIKI_CATEGORIES } from "./constants";
import { type WikiArticle, type WikiCategory } from "./types";

const MAX_WIKI_DOC_BYTES = 8 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface AttachedDoc {
  storageId: string;
  fileName: string;
  fileContentType?: string;
  fileSize?: number;
}

interface ArticleValues {
  title: string;
  cat: WikiCategory;
  tags: string;
  body: string;
  url: string;
  doc: AttachedDoc | null;
}

function initialValues(article: WikiArticle | { draftId: string }): ArticleValues {
  if ("draftId" in article) {
    return { title: "", cat: "Produktdaten", tags: "", body: "", url: "", doc: null };
  }
  return {
    title: article.title,
    cat: article.cat,
    tags: article.tags,
    body: article.body,
    url: article.url ?? "",
    doc:
      article.storageId && article.fileName
        ? {
            storageId: article.storageId,
            fileName: article.fileName,
            fileContentType: article.fileContentType,
            fileSize: article.fileSize,
          }
        : null,
  };
}

/** .docx text extraction runs client-side (mammoth, already bundled for the
 * file viewer's DocxPreview) — only a PDF's raw bytes go to the server,
 * where Claude reads it natively. */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-semibold text-muted-foreground">{children}</label>
  );
}

/**
 * A Sales Coach wiki article, written or edited on its own page. Dropping in
 * a document stores it and has AI read it in the background; what it
 * suggests arrives as a card to apply field by field, never written straight
 * into what's already been typed.
 */
export function WikiArticleEditor({ article }: { article: WikiArticle | { draftId: string } }) {
  const t = useTranslations("SalesCoachEv");
  const tc = useTranslations("Common");
  const ta = useTranslations("Ai");
  const router = useRouter();
  const eden = useEdenApi();
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const { openFileViewer } = useFileViewer();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const deleteFile = useMutation(api.files.deleteFile);
  const claimUpload = useMutation(api.files.claimUpload);

  const isEditing = !("draftId" in article);
  const subjectKey: string = isEditing ? article._id : article.draftId;
  const savedDoc = initialValues(article).doc;

  const [values, setValues] = useState<ArticleValues>(() => initialValues(article));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof ArticleValues>(key: K, value: ArticleValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const draft = useDraft<ArticleValues>({
    surface: "coachWiki",
    subjectKey,
    value: values,
    restore: isEditing ? "offer" : "auto",
    entitySavedAt: isEditing ? article.updatedAt : undefined,
    isEmpty: (v) =>
      !isEditing && !v.title.trim() && !v.body.trim() && !v.tags.trim() && !v.url.trim() && !v.doc,
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  const extraction = useAiRun<WikiDocumentExtraction>(
    { subjectKey: `coachWikiExtract:${subjectKey}` },
    parseJson,
  );
  const extractionUnseen = !!extraction.run && !extraction.run.seenAt;
  const suggestion = extractionUnseen && extraction.state === "done" ? extraction.result : null;

  /** Only storage uploaded here and not saved yet — never the file a saved
   *  article still points to. */
  function discardUnsaved(doc: AttachedDoc | null) {
    if (doc && doc.storageId !== savedDoc?.storageId) {
      void deleteFile({ storageId: doc.storageId as Id<"_storage"> }).catch(() => {});
    }
  }

  async function startExtraction(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx");
    try {
      const href = window.location.pathname;
      if (isPdf) await startWikiExtraction(apiClient, { file }, subjectKey, href);
      else {
        const text = isDocx ? await extractDocxText(file) : await file.text();
        await startWikiExtraction(apiClient, { text, fileName: file.name }, subjectKey, href);
      }
    } catch (e) {
      handleError(e, t("wikiDocumentAnalyzeFailed"));
    }
  }

  async function handleFile(file: File) {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const supported =
      file.type === "application/pdf" ||
      file.type === DOCX_MIME ||
      file.type.startsWith("text/") ||
      ["pdf", "docx", "txt", "md"].includes(ext);
    if (!supported) {
      toast.error(t("wikiDocumentUnsupported"));
      return;
    }
    if (file.size > MAX_WIKI_DOC_BYTES) {
      toast.error(t("wikiDocumentTooLarge", { max: "8 MB" }));
      return;
    }
    lastFileRef.current = file;
    setUploading(true);
    try {
      const storageId = await uploadToConvex(() => generateUploadUrl({}), file);
      await claimUpload({ storageId });
      discardUnsaved(values.doc);
      set("doc", {
        storageId,
        fileName: file.name,
        fileContentType: file.type || undefined,
        fileSize: file.size,
      });
    } catch (e) {
      handleError(e, t("wikiSaveFailed"));
      return;
    } finally {
      setUploading(false);
    }
    await startExtraction(file);
  }

  function removeDocument() {
    discardUnsaved(values.doc);
    set("doc", null);
  }

  function discardChanges() {
    const fresh = initialValues(article);
    if (values.doc?.storageId !== fresh.doc?.storageId) discardUnsaved(values.doc);
    setValues(fresh);
    void draft.clear(fresh);
  }

  const checks: ReadinessCheck[] = [
    {
      key: "title",
      label: t("wikiFieldTitle"),
      done: !!values.title.trim(),
      onFix: () => titleRef.current?.focus(),
    },
    {
      key: "body",
      label: t("wikiFieldBody"),
      done: !!values.body.trim(),
      onFix: () => bodyRef.current?.focus(),
    },
    { key: "tags", label: t("wikiFieldTags"), done: !!values.tags.trim(), optional: true },
    { key: "doc", label: t("wikiFieldDocument"), done: !!values.doc, optional: true },
  ];

  async function save() {
    setSaving(true);
    try {
      const doc = values.doc;
      const fileChanged = doc?.storageId !== savedDoc?.storageId;
      const input = {
        title: values.title.trim(),
        cat: values.cat,
        tags: values.tags.trim(),
        body: values.body.trim(),
        url: values.url.trim() || undefined,
        ...(fileChanged && doc
          ? {
              storageId: doc.storageId,
              fileName: doc.fileName,
              fileContentType: doc.fileContentType,
              fileSize: doc.fileSize,
            }
          : {}),
        ...(fileChanged && !doc ? { removeFile: true } : {}),
      };
      if (isEditing) await updateWikiArticle(eden, article._id, input);
      else await createWikiArticle(eden, input);
      await draft.clear();
      router.push("/sales-coach-ev/wiki");
    } catch (e) {
      handleError(e, t("wikiSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!isEditing) return;
    const ok = await confirm({
      title: t("wikiDeleteConfirm"),
      details: [{ label: t("wikiFieldTitle"), value: article.title }],
      confirmLabel: t("wikiDelete"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteWikiArticle(eden, article._id);
      await draft.clear();
      router.push("/sales-coach-ev/wiki");
    } catch (e) {
      handleError(e, t("wikiDeleteFailed"));
      setSaving(false);
    }
  }

  const suggestionRows = suggestion
    ? [
        {
          key: "title",
          label: t("wikiFieldTitle"),
          value: suggestion.title,
          applied: suggestion.title === values.title,
          apply: () => set("title", suggestion.title),
        },
        {
          key: "cat",
          label: t("wikiFieldCategory"),
          value: suggestion.cat,
          applied: suggestion.cat === values.cat,
          apply: () => set("cat", suggestion.cat),
        },
        {
          key: "tags",
          label: t("wikiFieldTags"),
          value: suggestion.tags,
          applied: suggestion.tags === values.tags,
          apply: () => set("tags", suggestion.tags),
        },
        {
          key: "body",
          label: t("wikiFieldBody"),
          value: suggestion.body,
          applied: suggestion.body === values.body,
          apply: () => set("body", suggestion.body),
        },
      ].filter((row) => row.value)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/sales-coach-ev/wiki"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("wikiBackToList")}
        </Link>
        <h2 className="text-[15px] font-semibold tracking-tight">
          {isEditing ? t("wikiEditTitle") : t("wikiNewTitle")}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {(draft.savedAt !== null || draft.status !== "idle") && (
            <DraftIndicator draft={draft} onDiscard={discardChanges} className="mr-1" />
          )}
          {isEditing && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => void remove()}
              disabled={saving}
            >
              <Trash2 />
              {t("wikiDelete")}
            </Button>
          )}
          <ReadinessSubmit
            size="sm"
            className="max-md:hidden"
            checks={checks}
            readyTitle={t("wikiReadyToSave")}
            busy={saving}
            disabled={uploading}
            onSubmit={() => void save()}
          >
            {t("save")}
          </ReadinessSubmit>
        </div>
      </div>

      <DraftOfferBanner draft={draft} />
      <DraftRestoredNote draft={draft} onStartOver={discardChanges} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <input
            ref={titleRef}
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("wikiFieldTitlePlaceholder")}
            autoFocus={!isEditing}
            className="w-full border-0 border-b border-transparent bg-transparent pb-2 font-display text-2xl font-semibold tracking-tight placeholder:text-muted-foreground/50 focus:border-border focus:outline-none md:text-3xl"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>{t("wikiFieldCategory")}</FieldLabel>
              <Select value={values.cat} onValueChange={(v) => set("cat", v as WikiCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIKI_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>{t("wikiFieldTags")}</FieldLabel>
              <Input
                value={values.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="Wallbox, AC, Preis"
              />
            </div>
          </div>
          <div>
            <FieldLabel>{t("wikiFieldBody")}</FieldLabel>
            <Textarea
              ref={bodyRef}
              value={values.body}
              onChange={(e) => set("body", e.target.value)}
              className="min-h-[45vh] leading-relaxed"
            />
          </div>
          <div>
            <FieldLabel>{t("wikiFieldUrl")}</FieldLabel>
            <Input
              value={values.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <ReadinessCard checks={checks} readyTitle={t("wikiReadyToSave")} />

          <section className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {t("wikiFieldDocument")}
            </p>
            {values.doc ? (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() =>
                    values.doc &&
                    openFileViewer({
                      storageId: values.doc.storageId,
                      name: values.doc.fileName,
                      contentType: values.doc.fileContentType,
                      size: values.doc.fileSize,
                    })
                  }
                >
                  {values.doc.fileName}
                </button>
                {typeof values.doc.fileSize === "number" && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(values.doc.fileSize)}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={tc("delete")}
                  onClick={removeDocument}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Upload className="size-5" />
                )}
                <span className="font-medium">{t("wikiDocumentUpload")}</span>
                <span className="flex items-center gap-1 text-[11px]">
                  <AiGlyph className="size-3" />
                  {ta("kind.coachWikiExtract")}
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
          </section>

          {extractionUnseen && !suggestion && (
            <AiRunCard
              view={extraction}
              onRetry={
                lastFileRef.current
                  ? () => {
                      if (lastFileRef.current) void startExtraction(lastFileRef.current);
                    }
                  : undefined
              }
              onDismiss={extraction.markSeen}
            />
          )}

          {suggestion && (
            <section className="rounded-xl border border-border/70 bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">
                <span className="ai-text">{ta("eyebrow")}</span>
                <span className="text-muted-foreground"> · {ta("kind.coachWikiExtract")}</span>
              </p>
              <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight">
                {suggestion.fileName
                  ? t("wikiExtractReady", { file: suggestion.fileName })
                  : t("wikiExtractReadyNoFile")}
              </h3>
              <ul className="mt-2 divide-y divide-border/60">
                {suggestionRows.map((row, index) => (
                  <li key={row.key} className="ai-rise py-2.5" style={{ ["--i" as string]: index }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
                      {row.applied ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check className="size-3.5" strokeWidth={3} />
                          {t("wikiApplied")}
                        </span>
                      ) : (
                        <Button size="xs" variant="outline" onClick={row.apply}>
                          {t("wikiApply")}
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm">{row.value}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={extraction.markSeen}>
                  {ta("dismiss")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    for (const row of suggestionRows) if (!row.applied) row.apply();
                    extraction.markSeen();
                  }}
                >
                  {t("wikiApplyAll")}
                </Button>
              </div>
            </section>
          )}
        </aside>
      </div>

      <MobileActionBar>
        <ReadinessMeter checks={checks} className="mr-auto" />
        <ReadinessSubmit
          checks={checks}
          readyTitle={t("wikiReadyToSave")}
          busy={saving}
          disabled={uploading}
          onSubmit={() => void save()}
        >
          {t("save")}
        </ReadinessSubmit>
      </MobileActionBar>
    </div>
  );
}
