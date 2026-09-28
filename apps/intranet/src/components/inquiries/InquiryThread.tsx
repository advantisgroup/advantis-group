"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Lock, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Detail = NonNullable<FunctionReturnType<typeof api.marketing.inbox.get>>;
type Message = Detail["messages"][number];
type Note = Detail["notes"][number];

type Entry =
  | { kind: "message"; at: number; message: Message }
  | { kind: "note"; at: number; note: Note };

/**
 * The conversation with the customer and the team's notes on it, in one
 * timeline. Notes are marked and tinted so nobody mistakes one for something
 * the customer has read.
 */
export function InquiryThread({
  detail,
  meId,
  format,
}: {
  detail: Detail;
  meId: string;
  format: Intl.DateTimeFormat;
}) {
  const t = useTranslations("Inquiries");
  const entries: Entry[] = [
    ...detail.messages.map((message) => ({
      kind: "message" as const,
      at: message.createdAt,
      message,
    })),
    ...detail.notes.map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
  ].sort((a, b) => a.at - b.at);

  if (entries.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("noReplies")}</p>;
  }

  return (
    <ol className="mt-4 space-y-4">
      {entries.map((entry) =>
        entry.kind === "message" ? (
          <MessageItem key={entry.message._id} message={entry.message} format={format} />
        ) : (
          <NoteItem
            key={entry.note._id}
            note={entry.note}
            mine={entry.note.authorUserId === meId}
            format={format}
          />
        ),
      )}
    </ol>
  );
}

function MessageItem({ message, format }: { message: Message; format: Intl.DateTimeFormat }) {
  const t = useTranslations("Inquiries");
  return (
    <li
      className={cn(
        "rounded-lg border px-4 py-3",
        message.author === "staff" ? "border-primary/30 bg-primary/5" : "border-border",
      )}
    >
      <p className="text-xs text-muted-foreground">
        {message.author === "staff"
          ? (message.staffName ?? t("actors.staff"))
          : t("actors.customer")}
        {" · "}
        {format.format(message.createdAt)}
        {message.via === "email" ? ` · ${t("viaEmail")}` : ""}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
      <Attachments items={message.attachments} />
    </li>
  );
}

function NoteItem({
  note,
  mine,
  format,
}: {
  note: Note;
  mine: boolean;
  format: Intl.DateTimeFormat;
}) {
  const t = useTranslations("Inquiries.notes");
  const editNote = useMutation(api.marketing.inbox.editNote);
  const deleteNote = useMutation(api.marketing.inbox.deleteNote);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      return true;
    } catch {
      toast.error(t("failed"));
      return false;
    }
  };

  return (
    <li className="rounded-lg border border-dashed border-warn/50 bg-warn/5 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="size-3" />
        <span className="font-medium text-foreground">{t("label")}</span>
        {" · "}
        {note.authorName ?? t("someone")}
        {" · "}
        {format.format(note.createdAt)}
        {note.editedAt ? ` · ${t("edited")}` : ""}
        {mine && !editing ? (
          <span className="ml-auto flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("edit")}
              onClick={() => {
                setDraft(note.body);
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("delete")}
              onClick={async () => {
                const ok = await confirm({
                  title: t("deleteConfirm"),
                  confirmLabel: t("delete"),
                  cancelLabel: t("cancel"),
                  destructive: true,
                });
                if (ok) void run(() => deleteNote({ noteId: note._id }));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </span>
        ) : null}
      </p>
      {editing ? (
        <div className="mt-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            aria-label={t("edit")}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={() =>
                void run(() => editNote({ noteId: note._id, body: draft })).then(
                  (ok) => ok && setEditing(false),
                )
              }
            >
              {t("save")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{note.body}</p>
      )}
    </li>
  );
}

export function Attachments({
  items,
}: {
  items: { storageId: string; name?: string; url: string | null }[] | undefined;
}) {
  if (!items?.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) =>
        item.url ? (
          <li key={item.storageId}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              <Paperclip className="size-3.5" aria-hidden />
              {item.name ?? item.storageId}
            </a>
          </li>
        ) : null,
      )}
    </ul>
  );
}
