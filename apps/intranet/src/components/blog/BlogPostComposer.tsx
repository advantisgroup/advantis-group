"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowLeft, Eye, ImagePlus, Loader2, PenLine, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { BlogPostPreview } from "@/components/blog/BlogPostPreview";
import { type BlogPostEntry, useBlogPostForm } from "@/components/blog/useBlogPostForm";
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

/**
 * Full-screen blog post composer — same shell pattern as WikiEntryComposer
 * (sticky header, split-pane write/preview, Options sheet for everything
 * that isn't the headline content, mobile write/preview toggle) so authoring
 * a blog post feels like the rest of the app instead of a generic CMS form.
 * Deliberately skips WikiEntryComposer's document-import/AI-assist machinery
 * — a blog post doesn't need it, and it isn't part of what was asked for.
 */
export function BlogPostComposer({ entry }: { entry: BlogPostEntry | "new" }) {
  const t = useTranslations("Blog");
  const tc = useTranslations("Common");
  const router = useRouter();
  const me = useCurrentUser();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const [splitPct, setSplitPct] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);

  const form = useBlogPostForm({
    entry,
    onDone: () => router.push("/blog"),
  });

  function persistSplit(pct: number) {
    setSplitPct(pct);
    try {
      localStorage.setItem(SPLIT_KEY, String(pct));
    } catch {
      // Storage unavailable — the split just isn't remembered.
    }
  }

  const optionsBody = (
    <div className="space-y-4">
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
          placeholder={t("fieldExcerptPlaceholder")}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
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
          <button
            type="button"
            onClick={() => form.setPublished(!form.published)}
            title={t("fieldPublished")}
            className={cn(
              "truncate text-[11px] font-medium underline-offset-2 hover:underline",
              form.published ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {form.published ? t("statusPublished") : t("statusDraft")}
          </button>
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
        >
          <Settings className="size-4" />
        </Button>
        <Button onClick={() => void form.submit()} disabled={form.busy}>
          {form.uploadingCover ? (
            <Loader2 className="size-4 animate-spin" />
          ) : form.isEditing ? (
            tc("save")
          ) : (
            tc("create")
          )}
        </Button>
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
              <input
                value={form.title}
                onChange={(e) => form.setTitle(e.target.value)}
                placeholder={t("fieldTitlePlaceholder")}
                autoFocus
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
