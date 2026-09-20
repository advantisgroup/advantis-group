"use client";

import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";

import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useIsMobile } from "@/hooks/use-mobile";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type MentionCandidate,
  type RichTextController,
  useRichTextController,
} from "./rich-text-controller";
import {
  type FileLinkCandidate,
  RichDateEditor,
  RichLinkEditor,
  RichTextToolbar,
} from "./rich-text-toolbar";

/** The contentEditable surface — placeable independently of the toolbar. */
export function RichTextSurface({
  controller,
  placeholder,
  onFocus,
  onBlur,
  className,
}: {
  controller: RichTextController;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}) {
  const t = useTranslations("RichText");
  return (
    <>
      <div
        ref={controller.ref}
        data-rte
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={controller.handleInput}
        onFocus={onFocus}
        onBlur={() => {
          controller.emit();
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (controller.handleMentionKeyDown(e.key) || controller.handleSlashKeyDown(e.key)) {
            e.preventDefault();
          }
        }}
        onKeyUp={controller.refreshActive}
        onMouseUp={controller.refreshActive}
        onClick={(event) => {
          const date = (event.target as HTMLElement).closest<HTMLElement>("[data-rich-date-start]");
          if (date) {
            event.preventDefault();
            controller.openDateEditor(date);
          }
        }}
        role="textbox"
        aria-multiline="true"
        className={cn("rich-text px-3.5 py-3 outline-none", className)}
      />
      {controller.mention && controller.mentionMatches.length > 0 && (
        <div
          role="listbox"
          className="fixed z-50 w-64 overflow-hidden rounded-lg border border-border/70 bg-popover py-1 shadow-overlay"
          style={{ top: controller.mention.rect.bottom + 6, left: controller.mention.rect.left }}
        >
          {controller.mentionMatches.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === controller.mentionActiveIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                controller.insertMention(c);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm",
                i === controller.mentionActiveIndex ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <Avatar className="size-6 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.name} />}
                <AvatarFallback className="text-[10px]">
                  {initials(c.name, c.email ?? "")}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {controller.slash && controller.slashMatches.length > 0 && (
        <div
          role="listbox"
          aria-label={t("slashMenu")}
          className="fixed z-50 w-64 overflow-hidden rounded-lg border border-border/70 bg-popover py-1 shadow-overlay"
          style={{
            top: Math.min(controller.slash.rect.bottom + 6, window.innerHeight - 260),
            left: controller.slash.rect.left,
          }}
        >
          {controller.slashMatches.map((command, index) => (
            <button
              key={command.key}
              type="button"
              role="option"
              aria-selected={index === controller.slashActiveIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                controller.runSlashCommand(command);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm",
                index === controller.slashActiveIndex ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <command.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{t(command.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
      <RichDateEditor controller={controller} />
      <RichLinkEditor controller={controller} />
    </>
  );
}

export function RichTextEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className,
  minHeight,
  mentionCandidates,
  fileLinkCandidates,
  aiFormatSlot,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Fires when the editor gains focus — e.g. to track "which field is active" for external assignment (see the applicant CV fallback form). */
  onFocus?: () => void;
  /** Fires after the editor's own blur handling (which already commits the value via onChange) — for callers that only want to persist on blur rather than on every keystroke. */
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /** Overrides the default `min-h-[14rem]` — smaller editors (e.g. a single CV field) don't need that much room. */
  minHeight?: string;
  /** Enables "@name" autocomplete when provided. */
  mentionCandidates?: MentionCandidate[];
  /** Enables an "insert file link" toolbar button listing these attached
   *  files when non-empty. Picking one inserts a special, previewable chip
   *  (see `.wiki-file-chip` / `WikiFileLinkText`). */
  fileLinkCandidates?: FileLinkCandidate[];
  /** Opt-in extra action rendered as a floating button over the editor (or,
   *  once the mobile keyboard docks the toolbar, as one more icon inside
   *  that docked bar — `inline: true` tells the slot to switch its own look
   *  accordingly). Kept as a render prop rather than a feature-specific
   *  import so this generic component doesn't need to know what it renders
   *  (currently only the wiki "format with AI" assist uses this). */
  aiFormatSlot?: (opts: { inline: boolean }) => ReactNode;
}) {
  const controller = useRichTextController({ value, onChange, mentionCandidates });
  const isMobile = useIsMobile();
  const keyboardInset = useKeyboardInset();
  const [focused, setFocused] = useState(false);
  // The inline toolbar scrolls away above the keyboard as soon as there's a
  // paragraph or two of text, so on mobile it moves to a bar sitting on top
  // of the keyboard instead. It stays rendered in place (just hidden) so the
  // box doesn't jump by a row's height when the keyboard opens.
  const docked = isMobile && focused && keyboardInset > 0;

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
          className,
        )}
      >
        <RichTextToolbar
          controller={controller}
          fileLinkCandidates={fileLinkCandidates}
          className={cn("border-b border-border/70 bg-muted/40 px-1.5 py-1", docked && "invisible")}
        />
        <RichTextSurface
          controller={controller}
          placeholder={placeholder}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          className={cn("max-h-[28rem] overflow-y-auto", minHeight ?? "min-h-[14rem]")}
        />
        {aiFormatSlot && !docked && aiFormatSlot({ inline: false })}
      </div>
      {docked &&
        createPortal(
          <div
            style={{ bottom: keyboardInset }}
            className="fixed inset-x-0 z-50 flex items-center gap-1 border-t border-border/70 bg-card px-2 py-1.5 shadow-[0_-4px_16px_-6px_rgb(0_0_0/0.25)]"
          >
            <RichTextToolbar
              controller={controller}
              fileLinkCandidates={fileLinkCandidates}
              className="flex-1 justify-center"
            />
            {aiFormatSlot?.({ inline: true })}
          </div>,
          document.body,
        )}
    </>
  );
}
