"use client";

import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { ArrowLeft, FileUp, Loader2, PenLine, Settings, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useWikiEntryForm } from "@/components/guidebooks/useWikiEntryForm";
import { WikiEntryPreview } from "@/components/guidebooks/WikiEntryPreview";
import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { htmlToText } from "@/components/ui/rich-text";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SplitDivider } from "@/components/ui/split-divider";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type ImportExt,
  IMPORT_FILE_ACCEPT,
  importFile,
  WikiImportError,
  type WikiImportErrorCode,
} from "@/lib/wiki-import";
import { useWikiImportApi } from "@/lib/wiki-import-api";
import { cn } from "@/lib/utils";

const PdfPreview = dynamic(
  () => import("@/components/file-viewer/PdfPreview").then((mod) => mod.PdfPreview),
  { ssr: false, loading: () => <Loader2 className="size-6 animate-spin text-white/70" /> },
);
const DocxPreview = dynamic(
  () => import("@/components/file-viewer/DocxPreview").then((mod) => mod.DocxPreview),
  { ssr: false, loading: () => <Loader2 className="size-6 animate-spin text-white/70" /> },
);

const SPLIT_KEY = "guidebooks:composerSplit";

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

/** The very first decision — write from scratch, or import a document and
 *  start from its extracted text. A one-way fork: once either path is
 *  chosen the composer proper takes over, rather than offering to switch
 *  mid-draft and risk clobbering work already typed. */
function ChooseSourceStep({
  onManual,
  onFile,
  importing,
  importError,
}: {
  onManual: () => void;
  onFile: (file: File) => void;
  importing: boolean;
  importError: WikiImportErrorCode | null;
}) {
  const t = useTranslations("Guidebooks");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onManual}
          disabled={importing}
          className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PenLine className="size-4" />
          </span>
          <span className="font-display font-semibold">{t("sourceManualTitle")}</span>
          <span className="text-xs text-muted-foreground">{t("sourceManualHint")}</span>
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={importing}
          className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
          </span>
          <span className="font-display font-semibold">{t("sourceImportTitle")}</span>
          <span className="text-xs text-muted-foreground">{t("sourceImportHint")}</span>
        </button>
      </div>
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
      {importError && (
        <div
          role="alert"
          className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          {t(importErrorMessageKey(importError))}
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen "New wiki entry" composer — same shell pattern as
 * `AnnouncementComposer` (sticky header, own scroll region, an Options sheet
 * for everything that isn't the headline content) so creating a guidebook
 * entry and creating an announcement feel like the same app. Editing an
 * existing entry still goes through the compact `EntryDialog` — this is
 * create-only, matching how it's linked to from the guidebooks list.
 *
 * Starts on a "manual vs. import a document" fork (`ChooseSourceStep`).
 * Importing runs the deterministic client-side extraction in
 * `lib/wiki-import.ts` (no model involved) and prefills thema/erklaerung;
 * the source file itself is staged as a normal pending attachment (visible,
 * removable in the Options sheet — that visibility *is* the confirmation
 * before it's actually attached on save, no separate dialog needed) and
 * unlocks the split-pane's "original file" preview alongside the usual
 * live wiki preview. The optional "improve with AI" action in the Options
 * sheet only ever touches thema/tags/category — never body content.
 */
export function WikiEntryComposer() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  const isMobile = useIsMobile();
  const handleError = useErrorHandler();
  const importApi = useWikiImportApi();

  const [stage, setStage] = useState<"choose" | "compose">("choose");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<WikiImportErrorCode | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceExt, setSourceExt] = useState<ImportExt | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const [previewTab, setPreviewTab] = useState<"live" | "original">("live");
  const [splitPct, setSplitPct] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);

  const entryForm = useWikiEntryForm({
    entry: "new",
    onDone: (slug) => router.push(`/guidebooks/${slug}`),
  });

  useEffect(() => {
    const raw = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(raw) && raw >= 25 && raw <= 75) setSplitPct(raw);
  }, []);

  function persistSplit(pct: number) {
    setSplitPct(pct);
    try {
      localStorage.setItem(SPLIT_KEY, String(pct));
    } catch {
      // Storage unavailable — the split just isn't remembered.
    }
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
    setImportError(null);
    try {
      const result = await importFile(file);
      entryForm.setThema(result.thema);
      entryForm.setErklaerung(result.html);
      entryForm.attachmentUpload.add([file]);
      setSourceFile(file);
      setSourceExt(result.ext);
      if (result.hadImages) toast.info(t("importImagesDropped"));
      setStage("compose");
    } catch (e) {
      setImportError(e instanceof WikiImportError ? e.code : "extract-failed");
    } finally {
      setImporting(false);
    }
  }

  async function onImproveWithAI() {
    setAssisting(true);
    try {
      const plainText = htmlToText(entryForm.erklaerung);
      const result = await importApi.assist(plainText);
      if (result.thema) entryForm.setThema(result.thema);
      if (result.tags.length > 0) entryForm.setTags(result.tags);
      if (result.categoryHint) {
        const hint = result.categoryHint.toLowerCase();
        const match = entryForm.categories.find(
          (c) =>
            c.name.toLowerCase() === hint ||
            c.name.toLowerCase().includes(hint) ||
            hint.includes(c.name.toLowerCase()),
        );
        if (match) entryForm.setCategoryId(match._id);
        else toast.info(t("importAssistCategoryHint", { hint: result.categoryHint }));
      }
      toast.success(t("importAssistApplied"));
    } catch (e) {
      handleError(e);
    } finally {
      setAssisting(false);
    }
  }

  const category = entryForm.categories.find((c) => c._id === entryForm.categoryId);
  const owner = entryForm.users.find((u) => u._id === entryForm.ownerUserId);

  const optionsBody = (
    <div className="space-y-4">
      {hasSourceFile && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onImproveWithAI()}
            disabled={assisting}
          >
            <Sparkles className="mr-1.5 size-3.5" />
            {assisting ? t("importAssistRunning") : t("importAssistCta")}
          </Button>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t("importAssistHint")}</p>
        </div>
      )}
      {entryForm.optionsFields}
      <div className="border-t border-border/60 pt-4">{entryForm.attachmentsSlot}</div>
      <div className="border-t border-border/60 pt-4">
        <Link
          href="/guidebooks/new/advanced"
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {t("composerSwitchToAdvanced")}
        </Link>
      </div>
    </div>
  );

  const previewPane = (
    <>
      {hasSourceFile && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
          {(["live", "original"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPreviewTab(v)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                previewTab === v
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "live" ? t("previewLive") : t("previewOriginal")}
            </button>
          ))}
        </div>
      )}
      {previewTab === "original" && sourceFile && sourceExt ? (
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 md:px-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/guidebooks" aria-label={tc("back")}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{t("createEntry")}</p>
          <p className="truncate text-[11px] text-muted-foreground">{t("createEntryHint")}</p>
        </div>

        {stage === "compose" && (
          <>
            {isMobile && (
              <div className="mr-1 flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
                {(["write", "preview"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMobileView(v)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      mobileView === v
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v === "write" ? t("write") : t("preview")}
                  </button>
                ))}
              </div>
            )}
            <Link
              href="/guidebooks/new/advanced"
              className="hidden shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline sm:inline"
            >
              {t("composerSwitchToAdvanced")}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("optionsSheetTitle")}
              onClick={() => setOptionsOpen(true)}
            >
              <Settings className="size-4" />
            </Button>
            <Button onClick={() => void entryForm.submit()} disabled={entryForm.busy}>
              {tc("create")}
            </Button>
          </>
        )}
      </header>

      {stage === "choose" ? (
        <ChooseSourceStep
          onManual={() => setStage("compose")}
          onFile={(file) => void onFileImported(file)}
          importing={importing}
          importError={importError}
        />
      ) : (
        <div ref={splitRef} className="flex min-h-0 flex-1">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-none"
            style={!isMobile ? { width: `${splitPct}%` } : undefined}
          >
            {isMobile && mobileView === "preview" ? (
              <div className="flex-1 overflow-y-auto px-4 py-4">{previewPane}</div>
            ) : (
              <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-10 md:py-8">
                <input
                  value={entryForm.thema}
                  onChange={(e) => entryForm.setThema(e.target.value)}
                  placeholder={t("fieldThemaPlaceholder")}
                  autoFocus
                  className="w-full border-0 border-b border-transparent bg-transparent pb-2 font-display text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:border-border focus:outline-none md:text-3xl"
                />
                <div className="mt-4">
                  <RichTextEditor
                    value={entryForm.erklaerung}
                    onChange={entryForm.setErklaerung}
                    placeholder={t("fieldErklaerungPlaceholder")}
                    minHeight="40vh"
                    fileLinkCandidates={entryForm.fileLinkCandidates}
                  />
                </div>
              </div>
            )}
          </div>

          {!isMobile && (
            <SplitDivider
              containerRef={splitRef}
              value={splitPct}
              onResize={persistSplit}
              onReset={() => persistSplit(50)}
              ariaLabel="Resize editor and preview"
            />
          )}
          {!isMobile && (
            <div
              className="hidden min-h-0 flex-col overflow-y-auto border-l border-border/60 bg-muted/10 md:flex"
              style={{ width: `${100 - splitPct}%` }}
            >
              <div className="mx-auto w-full max-w-2xl px-6 py-8">{previewPane}</div>
            </div>
          )}
        </div>
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
