"use client";

import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";
import { ArrowLeft, Eye, FileUp, Loader2, PenLine, Settings } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import {
  DraftIndicator,
  DraftOfferBanner,
  DraftRestoredNote,
} from "@/components/compose/DraftIndicator";
import { MobileActionBar } from "@/components/compose/MobileActionBar";
import { ReadinessCard } from "@/components/compose/Readiness";
import { ReadinessSubmit } from "@/components/compose/ReadinessSubmit";
import { useWikiEntryForm } from "@/components/guidebooks/useWikiEntryForm";
import {
  formatRunNeedsPane,
  useWikiFormatRun,
  WikiFormatReview,
  WikiFormatTrigger,
} from "@/components/guidebooks/WikiAiFormatAssist";
import { type WikiEntry } from "@/components/guidebooks/WikiEntryDialogs";
import { WikiEntryPreview } from "@/components/guidebooks/WikiEntryPreview";
import { WikiMetaAssist } from "@/components/guidebooks/WikiMetaAssist";
import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { useRichTextController } from "@/components/ui/rich-text-controller";
import { RichTextSurface } from "@/components/ui/rich-text-editor";
import { RichTextToolbar } from "@/components/ui/rich-text-toolbar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  type ImportExt,
  IMPORT_FILE_ACCEPT,
  importFile,
  WikiImportError,
  type WikiImportErrorCode,
} from "@/lib/wiki-import";

const PdfPreview = dynamic(
  () => import("@/components/file-viewer/PdfPreview").then((mod) => mod.PdfPreview),
  { ssr: false, loading: () => <Loader2 className="size-6 animate-spin text-white/70" /> },
);
const DocxPreview = dynamic(
  () => import("@/components/file-viewer/DocxPreview").then((mod) => mod.DocxPreview),
  { ssr: false, loading: () => <Loader2 className="size-6 animate-spin text-white/70" /> },
);

type PreviewTab = "live" | "original" | "ai";

/** Read-only rendering of the file the entry was imported from — reusing
 *  the same PdfPreview/DocxPreview the global file viewer uses, wrapped in
 *  a dark card since those components render white text/pages meant to sit
 *  on a dark backdrop (their usual context), not directly on this
 *  composer's light background. */
function OriginalFilePreview({ file, ext }: { file: File; ext: ImportExt }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (ext === "txt" || ext === "md") {
      let cancelled = false;
      void file.text().then((t) => {
        if (!cancelled) setText(t);
      });
      return () => {
        cancelled = true;
      };
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, ext]);

  if (ext === "txt" || ext === "md") {
    if (text === null) {
      return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />;
    }
    return (
      <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-border bg-muted/20 p-4">
        <pre className="whitespace-pre-wrap font-sans text-xs text-foreground">{text}</pre>
      </div>
    );
  }

  if (!url) return null;
  return (
    <div className="flex h-[60vh] max-h-[32rem] items-center justify-center overflow-hidden rounded-xl bg-neutral-900 p-4">
      {ext === "docx" ? <DocxPreview url={url} /> : <PdfPreview url={url} />}
    </div>
  );
}

function importErrorMessageKey(code: WikiImportErrorCode): string {
  switch (code) {
    case "unsupported-type":
      return "importErrorUnsupportedType";
    case "too-large":
      return "importErrorTooLarge";
    case "no-text-layer":
      return "importErrorNoTextLayer";
    default:
      return "importErrorExtractFailed";
  }
}

/**
 * "Import a document" as a toolbar command rather than a gate in front of the
 * composer. It used to be one half of a one-way fork on a screen of its own:
 * picking "write manually" meant the extraction could never be reached again,
 * and a file with no text layer left you stranded there with an error.
 */
function ImportButton({
  onFile,
  importing,
  compact,
}: {
  onFile: (file: File) => void;
  importing: boolean;
  /** Icon only — the mobile bar has no room for the label. */
  compact?: boolean;
}) {
  const t = useTranslations("Guidebooks");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon" : "sm"}
        disabled={importing}
        title={t("sourceImportTitle")}
        aria-label={t("sourceImportTitle")}
        className="shrink-0 text-muted-foreground"
        onClick={() => inputRef.current?.click()}
      >
        {importing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {!compact && t("importAction")}
      </Button>
      {/* Sibling of the trigger button, not nested inside it — a <button>
          containing an <input> is invalid HTML and unreliable on mobile
          browsers (same pattern GuidebookAttachments already uses). */}
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}

/**
 * The one place a wiki entry is written or edited — full screen, because an
 * entry is a rich body plus a stack of details, and that never fit a dialog.
 *
 * Left: the headline and body. Right: live preview, the imported original,
 * or — when formatting with AI — the review of what it changed. Everything
 * that isn't the headline content sits in the Options sheet, opened by the
 * readiness verdict when something required is still missing. The draft
 * keeps all of it across refreshes and devices.
 */
export function WikiEntryComposer({ entry }: { entry: WikiEntry | { draftId: Id<"drafts"> } }) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  // The composer is already behind manage_guidebooks; this is AI itself.
  const canUseAi = useAiEnabled();
  const isMobile = useIsMobile();
  const keyboardInset = useKeyboardInset();

  const entryForm = useWikiEntryForm({
    entry,
    onDone: (slug) => router.push(`/guidebooks/${slug}`),
  });
  const controller = useRichTextController({
    value: entryForm.erklaerung,
    onChange: entryForm.setErklaerung,
  });
  const { isEditing, entryKey, draft, readiness } = entryForm;
  const composeHref =
    "draftId" in entry ? `/guidebooks/draft/${entry.draftId}` : `/guidebooks/${entry.slug}/compose`;
  const backHref = "draftId" in entry ? "/guidebooks" : `/guidebooks/${entry.slug}`;

  const [importing, setImporting] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceExt, setSourceExt] = useState<ImportExt | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [view, setView] = useState<"write" | "preview">("write");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("live");
  const themaRef = useRef<HTMLInputElement>(null);

  const formatRun = useWikiFormatRun(entryKey);
  const showAiPane = formatRunNeedsPane(formatRun);
  useEffect(() => {
    setPreviewTab((tab) => (showAiPane ? "ai" : tab === "ai" ? "live" : tab));
  }, [showAiPane]);

  function showReview() {
    setPreviewTab("ai");
    setView("preview");
  }

  // The source file stays the "original" preview's subject only as long as
  // it's still actually staged for attachment — removing it there (the
  // existing PendingWikiAttachments remove button) is how a user declines
  // to keep it, and the preview should stop offering it once that happens.
  const hasSourceFile =
    !!sourceFile && entryForm.attachmentUpload.entries.some((e) => e.file === sourceFile);
  useEffect(() => {
    if (!hasSourceFile && previewTab === "original") setPreviewTab("live");
  }, [hasSourceFile, previewTab]);

  async function onFileImported(file: File) {
    setImporting(true);
    try {
      const result = await importFile(file);
      // Import can now happen mid-draft, so it appends rather than replacing —
      // overwriting a body someone already wrote would be unrecoverable.
      if (!entryForm.thema.trim()) entryForm.setThema(result.thema);
      const existing = entryForm.erklaerung.trim();
      entryForm.setErklaerung(existing ? `${existing}${result.html}` : result.html);
      entryForm.attachmentUpload.add([file]);
      setSourceFile(file);
      setSourceExt(result.ext);
      if (result.hadImages) toast.info(t("importImagesDropped"));
    } catch (e) {
      toast.error(
        t(importErrorMessageKey(e instanceof WikiImportError ? e.code : "extract-failed")),
      );
    } finally {
      setImporting(false);
    }
  }

  const checks = entryForm.checks.map((check) => ({
    ...check,
    onFix:
      check.key === "thema"
        ? () => {
            setView("write");
            requestAnimationFrame(() => themaRef.current?.focus());
          }
        : check.key === "erklaerung"
          ? undefined
          : () => setOptionsOpen(true),
  }));
  const readyTitle = isEditing ? t("readyToSave") : t("readyToCreate");
  const optionsNeedAttention = readiness.missing.some((c) => c.key !== "thema");

  const category = entryForm.categories.find((c) => c._id === entryForm.categoryId);
  const owner = entryForm.users.find((u) => u.userId === entryForm.ownerUserId);

  const optionsBody = (
    <div className="space-y-4">
      <ReadinessCard checks={checks} readyTitle={readyTitle} />
      {canUseAi && (
        <WikiMetaAssist
          entryKey={entryKey}
          href={composeHref}
          erklaerung={entryForm.erklaerung}
          thema={entryForm.thema}
          tags={entryForm.tags}
          categoryId={entryForm.categoryId}
          categories={entryForm.categories}
          onApply={(patch) => {
            if (patch.thema !== undefined) entryForm.setThema(patch.thema);
            if (patch.tags) entryForm.setTags(patch.tags);
            if (patch.categoryId) entryForm.setCategoryId(patch.categoryId);
          }}
        />
      )}
      {entryForm.optionsFields}
      <div className="border-t border-border/60 pt-4">{entryForm.attachmentsSlot}</div>
    </div>
  );

  const tabs: { key: PreviewTab; label: string }[] = [
    { key: "live", label: t("previewLive") },
    ...(hasSourceFile ? [{ key: "original" as const, label: t("previewOriginal") }] : []),
    ...(showAiPane ? [{ key: "ai" as const, label: t("previewAi") }] : []),
  ];

  const previewPane = (
    <>
      {tabs.length > 1 && (
        <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPreviewTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                previewTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.key === "ai" && (
                <AiGlyph working={formatRun.state === "working"} className="size-3" />
              )}
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {previewTab === "ai" ? (
        <WikiFormatReview
          html={entryForm.erklaerung}
          entryKey={entryKey}
          href={composeHref}
          onApply={entryForm.setErklaerung}
        />
      ) : previewTab === "original" && sourceFile && sourceExt ? (
        <OriginalFilePreview file={sourceFile} ext={sourceExt} />
      ) : (
        <WikiEntryPreview
          thema={entryForm.thema}
          erklaerung={entryForm.erklaerung}
          tags={entryForm.tags}
          link={entryForm.link}
          categoryName={category?.name}
          categoryColor={category?.color}
          ownerName={owner?.name ?? me.name}
          validFrom={entryForm.validFrom}
          validUntil={entryForm.validUntil}
          locale={locale}
        />
      )}
    </>
  );

  const optionsButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("optionsSheetTitle")}
      onClick={() => setOptionsOpen(true)}
      className="relative"
    >
      <Settings className="size-4" />
      {optionsNeedAttention && (
        <span className="absolute right-2 top-2 size-1.5 rounded-full bg-warning" />
      )}
    </Button>
  );
  const viewToggle = (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
      {(["write", "preview"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            view === v
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "write" ? t("write") : t("preview")}
        </button>
      ))}
    </div>
  );
  const submitButton = (
    <ReadinessSubmit
      checks={checks}
      readyTitle={readyTitle}
      busy={entryForm.busy}
      onSubmit={() => void entryForm.submit()}
    >
      {isEditing ? tc("save") : tc("create")}
    </ReadinessSubmit>
  );

  const showDraftLine = draft.savedAt !== null || draft.status !== "idle";

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
            {isEditing ? t("editEntryTitle") : t("createEntry")}
          </p>
          {showDraftLine ? (
            <DraftIndicator draft={draft} onDiscard={entryForm.discardChanges} />
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">
              {isEditing ? t("editEntryHint") : t("createEntryHint")}
            </p>
          )}
        </div>

        {!isMobile && (
          <>
            {viewToggle}
            {optionsButton}
            {submitButton}
          </>
        )}
      </header>

      {/* One column at reading width rather than a permanent 50/50 split — see
          the same change in AnnouncementComposer. The imported original and
          the AI review live as tabs inside the preview. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {view === "preview" ? (
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
              <div className="mx-auto w-full md:max-w-2xl">{previewPane}</div>
            </div>
          ) : (
            <>
              <div className="mx-auto w-full flex-1 px-4 py-5 md:max-w-2xl md:px-10 md:py-8">
                <DraftOfferBanner draft={draft} className="mb-4" />
                <DraftRestoredNote
                  draft={draft}
                  onStartOver={entryForm.discardChanges}
                  filesNotKept
                  className="mb-4"
                />
                <input
                  ref={themaRef}
                  value={entryForm.thema}
                  onChange={(e) => entryForm.setThema(e.target.value)}
                  placeholder={t("fieldThemaPlaceholder")}
                  autoFocus={!isEditing}
                  className="w-full border-0 border-b border-transparent bg-transparent pb-2 font-display text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:border-border focus:outline-none md:text-3xl"
                />
                {!isMobile && (
                  <div className="sticky top-0 z-10 -mx-1 mt-4 flex items-center gap-1 border-b border-border/60 bg-background/95 px-1 py-2 backdrop-blur">
                    <RichTextToolbar
                      controller={controller}
                      fileLinkCandidates={entryForm.fileLinkCandidates}
                      className="min-w-0 flex-1"
                    />
                    <ImportButton
                      onFile={(file) => void onFileImported(file)}
                      importing={importing}
                    />
                    {canUseAi && (
                      <WikiFormatTrigger
                        html={entryForm.erklaerung}
                        entryKey={entryKey}
                        href={composeHref}
                        inline
                        onShowReview={showReview}
                      />
                    )}
                  </div>
                )}
                {/* Same measure and padding as the title above it — the body
                      is a page, not a field, so nothing boxes it in. */}
                <RichTextSurface
                  controller={controller}
                  placeholder={t("fieldErklaerungPlaceholder")}
                  className="min-h-[50vh] px-0 pt-4"
                />
              </div>
              {isMobile && (
                <div
                  className="shrink-0 border-t border-border/70 bg-background/95 backdrop-blur"
                  // The layout viewport doesn't shrink for the keyboard, so
                  // sitting at the bottom of the column puts this bar behind
                  // it. Lift it by however much the keyboard covers.
                  style={{ marginBottom: keyboardInset }}
                >
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <RichTextToolbar
                      controller={controller}
                      fileLinkCandidates={entryForm.fileLinkCandidates}
                      className="min-w-0 flex-1 flex-nowrap overflow-x-auto"
                    />
                    <ImportButton
                      compact
                      onFile={(file) => void onFileImported(file)}
                      importing={importing}
                    />
                    {canUseAi && (
                      <WikiFormatTrigger
                        html={entryForm.erklaerung}
                        entryKey={entryKey}
                        href={composeHref}
                        inline
                        onShowReview={showReview}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isMobile && (
        <MobileActionBar inline>
          <Button
            variant="ghost"
            size="icon"
            aria-label={view === "write" ? t("preview") : t("write")}
            onClick={() => setView((v) => (v === "write" ? "preview" : "write"))}
          >
            {view === "write" ? <Eye className="size-4" /> : <PenLine className="size-4" />}
          </Button>
          {optionsButton}
          <span className="flex-1" />
          {submitButton}
        </MobileActionBar>
      )}

      {isMobile ? (
        <MobileDrawer
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          ariaLabel={t("optionsSheetTitle")}
        >
          <div className="border-b border-border/70 px-5 pb-3">
            <p className="font-display text-lg font-semibold leading-tight tracking-tight">
              {t("optionsSheetTitle")}
            </p>
          </div>
          <div className="px-5 py-4">{optionsBody}</div>
        </MobileDrawer>
      ) : (
        <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
            <div className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5">
              <SheetTitle>{t("optionsSheetTitle")}</SheetTitle>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{optionsBody}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
