"use client";

import { type Ref, useImperativeHandle, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Lock, Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// the same limits Convex checks on a reply's attachments
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

export type ComposerMode = "reply" | "note";

export interface ComposerHandle {
  /** Puts text into the reply box (a template, an AI draft) and switches to replying. */
  insert: (text: string, { replace }?: { replace?: boolean }) => void;
}

/**
 * Where the team writes: a reply the customer gets by mail and on their page,
 * or a note only the team sees. The two look different on purpose, so a note
 * is never sent by mistake.
 */
export function ReplyComposer({
  inquiryId,
  customerName,
  handle,
  onTypingChange,
  toolbar,
}: {
  inquiryId: Id<"emails">;
  customerName: string;
  handle?: Ref<ComposerHandle>;
  /** True while there's an unsent reply in the box — other people on the page see it. */
  onTypingChange?: (typing: boolean) => void;
  /** Extra controls beside "Attach" (templates, …); given the current mode. */
  toolbar?: (mode: ComposerMode) => React.ReactNode;
}) {
  const t = useTranslations("Inquiries");
  const reply = useMutation(api.marketing.inbox.reply);
  const addNote = useMutation(api.marketing.inbox.addNote);
  const generateUploadUrl = useMutation(api.marketing.inbox.generateUploadUrl);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode] = useState<ComposerMode>("reply");
  const [drafts, setDrafts] = useState<Record<ComposerMode, string>>({ reply: "", note: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const draft = drafts[mode];

  const setDraft = (next: string, forMode: ComposerMode = mode) => {
    setDrafts((current) => ({ ...current, [forMode]: next }));
    if (forMode === "reply") onTypingChange?.(next.trim().length > 0);
  };

  useImperativeHandle(handle, () => ({
    insert(text, { replace = false } = {}) {
      setMode("reply");
      const current = drafts.reply;
      setDraft(replace || !current.trim() ? text : `${current.trimEnd()}\n\n${text}`, "reply");
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  }));

  const upload = async (file: File) => {
    const url = await generateUploadUrl({});
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return {
      storageId,
      name: file.name,
      size: file.size,
      contentType: file.type,
      kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
    };
  };

  const send = async () => {
    if (sending) return;
    if (mode === "note" ? !draft.trim() : !draft.trim() && !files.length) return;
    setSending(true);
    try {
      if (mode === "note") {
        await addNote({ id: inquiryId, body: draft });
        setDraft("", "note");
        toast.success(t("notes.added"));
      } else {
        const attachments = await Promise.all(files.map(upload));
        await reply({
          id: inquiryId,
          body: draft,
          attachments: attachments.length ? attachments : undefined,
        });
        setDraft("", "reply");
        setFiles([]);
        toast.success(t("replySent"));
      }
    } catch {
      toast.error(t("actionFailed"));
    } finally {
      setSending(false);
    }
  };

  const pickFiles = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.some((file) => file.size > MAX_BYTES)) toast.error(t("tooLarge"));
    setFiles((current) =>
      [...current, ...picked.filter((file) => file.size <= MAX_BYTES)].slice(0, MAX_FILES),
    );
  };

  const note = mode === "note";

  return (
    <div className="mt-6">
      <div role="tablist" aria-label={t("composer.label")} className="flex gap-1">
        {(["reply", "note"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
              mode === value
                ? value === "note"
                  ? "border-warn/50 bg-warn/5 text-foreground"
                  : "border-border bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "note" ? <Lock className="size-3" aria-hidden /> : null}
            {t(`composer.${value}`)}
          </button>
        ))}
      </div>
      <label htmlFor="reply" className="sr-only">
        {note ? t("notes.label") : t("replyLabel")}
      </label>
      <Textarea
        ref={textareaRef}
        id="reply"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={note ? t("notes.placeholder") : t("replyPlaceholder", { name: customerName })}
        rows={5}
        className={cn("rounded-tl-none", note && "border-dashed border-warn/60 bg-warn/5")}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
      />
      {!note && files.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
            >
              <Paperclip className="size-3.5 text-muted-foreground" aria-hidden />
              {file.name}
              <button
                type="button"
                aria-label={t("removeFile", { name: file.name })}
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {note ? null : (
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground",
                files.length >= MAX_FILES && "pointer-events-none opacity-50",
              )}
            >
              <Paperclip className="size-3.5" aria-hidden />
              {t("attach")}
              <input
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx"
                className="sr-only"
                onChange={(event) => {
                  pickFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          )}
          {toolbar?.(mode)}
          <p className="text-xs text-muted-foreground">{note ? t("notes.hint") : t("replyHint")}</p>
        </div>
        <Button
          variant={note ? "outline" : "default"}
          onClick={() => void send()}
          disabled={sending || (note ? !draft.trim() : !draft.trim() && !files.length)}
        >
          {note ? <Lock /> : <Send />}
          {note ? t("notes.add") : t("sendReply")}
        </Button>
      </div>
    </div>
  );
}
