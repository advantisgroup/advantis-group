"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { Cloud, Loader2, Paperclip, SendHorizonal, Smile } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

export const COMPOSER_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "😊",
  "😉",
  "😎",
  "🤔",
  "😮",
  "😢",
  "😡",
  "👍",
  "👎",
  "🙏",
  "👏",
  "🙌",
  "💪",
  "❤️",
  "🔥",
  "🎉",
  "✨",
  "✅",
  "❌",
  "💯",
  "👀",
];

/** Composer textarea grows with the message up to roughly 6 lines, then scrolls. */
export const COMPOSER_MAX_HEIGHT = 160;

/**
 * The message-composer shell — the bordered box, the attach/OneDrive/emoji
 * affordances, the auto-growing textarea and the send button.
 *
 * Extracted so the IT-ticket thread and the chat look and behave identically
 * rather than each maintaining its own bar; the ticket version simply omits
 * `onPickOneDrive`, since ticket attachments don't go through OneDrive.
 * `above` and `overlay` are slots for the pieces that genuinely differ (chat's
 * reply/edit banner and @mention popup).
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  sending,
  placeholder,
  disabled,
  onPickFiles,
  onPickOneDrive,
  onEscape,
  submitBlocked,
  above,
  overlay,
  textareaRef: externalRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending?: boolean;
  placeholder: string;
  /** Blocks send even with content — e.g. an upload still in flight. */
  disabled?: boolean;
  onPickFiles?: (files: File[]) => void;
  onPickOneDrive?: () => void;
  onEscape?: () => void;
  /** True while another control owns Enter (chat's @mention list). */
  submitBlocked?: boolean;
  above?: ReactNode;
  overlay?: ReactNode;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalRef ?? internalRef;
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [value, textareaRef]);

  function insertEmoji(emoji: string) {
    onChange(value + emoji);
    textareaRef.current?.focus();
  }

  return (
    <div
      className="border-t border-border/70 p-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      {above}
      <div className="relative flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
        {overlay}

        {onPickFiles && (
          <>
            <button
              type="button"
              aria-label={t("attachFile")}
              onClick={() => fileInputRef.current?.click()}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                onPickFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </>
        )}

        {onPickOneDrive && (
          <button
            type="button"
            aria-label={tc("fromOneDrive")}
            title={tc("fromOneDrive")}
            onClick={onPickOneDrive}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
          >
            <Cloud className="h-5 w-5" />
          </button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("emoji")}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
            >
              <Smile className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-64 p-2">
            <div className="grid grid-cols-8 gap-0.5">
              {COMPOSER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="flex size-7 items-center justify-center rounded text-lg transition-transform hover:scale-125 hover:bg-accent"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="min-w-0 flex-1 self-center">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            className="min-h-9 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
            style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !submitBlocked) {
                e.preventDefault();
                onSend();
              }
              if (e.key === "Escape") onEscape?.();
            }}
          />
        </div>

        <Button
          size="icon"
          className="size-10 shrink-0 rounded-lg md:size-9"
          onClick={onSend}
          disabled={sending || disabled}
          aria-label={t("send")}
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <SendHorizonal className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
