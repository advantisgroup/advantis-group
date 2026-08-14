"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowLeft, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { useWikiEntryForm } from "@/components/guidebooks/useWikiEntryForm";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Full-screen "New wiki entry" composer — same shell pattern as
 * `AnnouncementComposer` (sticky header, own scroll region, an Options sheet
 * for everything that isn't the headline content) so creating a guidebook
 * entry and creating an announcement feel like the same app. Editing an
 * existing entry still goes through the compact `EntryDialog` — this is
 * create-only, matching how it's linked to from the guidebooks list.
 */
export function WikiEntryComposer() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const router = useRouter();
  const isMobile = useIsMobile();
  const [optionsOpen, setOptionsOpen] = useState(false);

  const entryForm = useWikiEntryForm({
    entry: "new",
    onDone: (slug) => router.push(`/guidebooks/${slug}`),
  });

  const optionsBody = (
    <div className="space-y-4">
      {entryForm.optionsFields}
      <div className="border-t border-border/60 pt-4">{entryForm.attachmentsSlot}</div>
      {/* Same link as the header's, repeated here — the header's is
          desktop-only (`hidden sm:inline`), so this is the only way a mobile
          visitor can reach the advanced editor at all. */}
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
      </header>

      <div className="flex-1 overflow-y-auto">
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
