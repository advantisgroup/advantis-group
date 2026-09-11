"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowLeft, Eye, ImagePlus, PenLine, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { BlogPostPreview } from "@/components/blog/BlogPostPreview";
import {
  BLOG_CATEGORIES,
  type BlogPostEntry,
  EXCERPT_MAX_LENGTH,
  useBlogPostForm,
} from "@/components/blog/useBlogPostForm";
import {
  DraftIndicator,
  DraftOfferBanner,
  DraftRestoredNote,
} from "@/components/compose/DraftIndicator";
import { ReadinessCard } from "@/components/compose/Readiness";
import { ReadinessSubmit } from "@/components/compose/ReadinessSubmit";
import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SplitDivider } from "@/components/ui/split-divider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SPLIT_KEY = "blog:composerSplit";

// Radix Select has no empty-string value, so "no category" needs a sentinel.
const NO_CATEGORY = "__none__";

/**
 * Full-screen blog post composer — same shell as the wiki composer (sticky
 * header, split write/preview, Options sheet, mobile write/preview toggle),
 * with the same draft and readiness behaviour: work is kept as it's typed,
 * and the save button says what's missing instead of refusing silently.
 */
export function BlogPostComposer({ entry }: { entry: BlogPostEntry | "new" }) {
  const t = useTranslations("Blog");
  const tc = useTranslations("Common");
  const router = useRouter();
  const me = useCurrentUser();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const [splitPct, setSplitPct] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);

  const form = useBlogPostForm({
    entry,
    onDone: () => router.push("/blog"),
  });
  const { draft, readiness } = form;

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

  const checks = form.checks.map((check) => ({
    ...check,
    onFix:
      check.key === "title"
        ? () => {
            setMobileView("write");
            requestAnimationFrame(() => titleRef.current?.focus());
          }
        : check.key === "body"
          ? undefined
          : () => setOptionsOpen(true),
  }));
  const readyTitle = form.published
    ? t("readyToPublish")
    : form.isEditing
      ? t("readyToSave")
      : t("readyToSaveDraft");
  const optionsNeedAttention = readiness.missing.some((c) => c.key !== "title" && c.key !== "body");

  const optionsBody = (
    <div className="space-y-4">
      <ReadinessCard checks={checks} readyTitle={readyTitle} />
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldSlug")}
        </label>
        <Input value={form.slug} onChange={(e) => form.setSlug(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldLanguage")}
        </label>
        <Select value={form.language} onValueChange={(v) => form.setLanguage(v as "de" | "en")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="de">{t("languageDe")}</SelectItem>
            <SelectItem value="en">{t("languageEn")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldCategory")}
        </label>
        <Select
          value={form.category || NO_CATEGORY}
          onValueChange={(v) => form.setCategory(v === NO_CATEGORY ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("fieldCategoryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>{t("fieldCategoryNone")}</SelectItem>
            {BLOG_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {t(`categories.${category}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("fieldCategoryHint")}</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldTranslationKey")}
        </label>
        <Input
          value={form.translationKey}
          onChange={(e) => form.setTranslationKey(e.target.value)}
          placeholder={t("fieldTranslationKeyPlaceholder")}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t("fieldTranslationKeyHint")}</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldExcerpt")}
        </label>
        <textarea
          value={form.excerpt}
          onChange={(e) => form.setExcerpt(e.target.value)}
          rows={3}
          maxLength={EXCERPT_MAX_LENGTH}
          placeholder={t("fieldExcerptPlaceholder")}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          {form.excerpt.length}/{EXCERPT_MAX_LENGTH}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldCoverImage")}
        </label>
        {form.coverPreviewUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob/remote preview, next/image's loader isn't needed here */}
            <img
              src={form.coverPreviewUrl}
              alt=""
              className="aspect-video w-full rounded-lg border border-border object-cover"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 size-7"
              onClick={form.removeCover}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ImagePlus className="size-5" />
            <span className="text-xs">{t("fieldCoverImageHint")}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) form.pickCoverFile(file);
          }}
        />
      </div>
      <div className="border-t border-border/60 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("fieldPublished")}</span>
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => form.setPublished(v)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  form.published === v
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v ? t("statusPublished") : t("statusDraft")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const previewPane = (
    <BlogPostPreview
      title={form.title}
      excerpt={form.excerpt}
      body={form.body}
      coverPreviewUrl={form.coverPreviewUrl}
      authorName={me.name}
    />
  );

  const showDraftLine = draft.savedAt !== null || draft.status !== "idle";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 md:px-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/blog" aria-label={tc("back")}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {form.isEditing ? t("editPost") : t("createPost")}
          </p>
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => form.setPublished(!form.published)}
              title={t("fieldPublished")}
              className={cn(
                "shrink-0 text-[11px] font-medium underline-offset-2 hover:underline",
                form.published ? "text-success" : "text-muted-foreground",
              )}
            >
              {form.published ? t("statusPublished") : t("statusDraft")}
            </button>
            {showDraftLine && (
              <>
                <span className="text-[11px] text-muted-foreground/50">·</span>
                <DraftIndicator draft={draft} onDiscard={form.discardChanges} />
              </>
            )}
          </div>
        </div>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={mobileView === "write" ? t("preview") : t("write")}
            onClick={() => setMobileView((v) => (v === "write" ? "preview" : "write"))}
          >
            {mobileView === "write" ? <Eye className="size-4" /> : <PenLine className="size-4" />}
          </Button>
        )}
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
        <ReadinessSubmit
          checks={checks}
          readyTitle={readyTitle}
          busy={form.busy}
          onSubmit={() => void form.submit()}
        >
          {form.isEditing ? tc("save") : tc("create")}
        </ReadinessSubmit>
      </header>

      <div ref={splitRef} className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-none"
          style={!isMobile ? { width: `${splitPct}%` } : undefined}
        >
          {isMobile && mobileView === "preview" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">{previewPane}</div>
          ) : (
            <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-10 md:py-8">
              <DraftOfferBanner draft={draft} className="mb-4" />
              <DraftRestoredNote draft={draft} onStartOver={form.discardChanges} className="mb-4" />
              <input
                ref={titleRef}
                value={form.title}
                onChange={(e) => form.setTitle(e.target.value)}
                placeholder={t("fieldTitlePlaceholder")}
                autoFocus={!form.isEditing}
                className="w-full border-0 border-b border-transparent bg-transparent pb-2 font-display text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:border-border focus:outline-none md:text-3xl"
              />
              <div className="mt-4">
                <RichTextEditor
                  value={form.body}
                  onChange={form.setBody}
                  placeholder={t("fieldBodyPlaceholder")}
                  minHeight="40vh"
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
          <div className="overflow-y-auto px-5 py-4">{optionsBody}</div>
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
