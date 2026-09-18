"use client";

import { useEffect, useMemo, type ReactNode } from "react";

import {
  ArrowLeft,
  Copy,
  LogOut,
  MoreVertical,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

/** Smaller pieces of `ConversationView`: the unavailable screen, message menus and attachment chips. */

/** Shown in place of the thread when a stale `?c=` link no longer resolves —
 *  distinguishes a fully deleted conversation from one the caller just isn't
 *  part of anymore (left, removed, or an unrelated link). */
export function ConversationUnavailable({
  status,
  onBack,
}: {
  status: "deleted" | "not_found";
  onBack: () => void;
}) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const deleted = status === "deleted";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1"
          onClick={onBack}
          aria-label={tc("back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {deleted ? <Trash2 className="h-7 w-7" /> : <LogOut className="h-7 w-7" />}
        </span>
        <div className="max-w-xs">
          <p className="text-base font-semibold text-foreground">
            {deleted ? t("conversationDeleted") : t("conversationNotFound")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {deleted ? t("conversationDeletedHint") : t("conversationNotFoundHint")}
          </p>
        </div>
        <Button onClick={onBack}>{t("backToChats")}</Button>
      </div>
    </div>
  );
}

export function MessageMenu({
  canEdit,
  canDelete,
  pinned,
  onTogglePin,
  onCreateTicket,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  labels,
}: {
  canEdit: boolean;
  canDelete: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onCreateTicket?: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  labels: {
    reply: string;
    copy: string;
    edit: string;
    delete: string;
    pin: string;
    unpin: string;
    ticket: string;
  };
}) {
  const items: ActionMenuItem[] = [
    { key: "reply", label: labels.reply, icon: <Reply />, onSelect: onReply },
    {
      key: "pin",
      label: pinned ? labels.unpin : labels.pin,
      icon: pinned ? <PinOff /> : <Pin />,
      onSelect: onTogglePin,
    },
    ...(onCreateTicket
      ? [
          {
            key: "ticket",
            label: labels.ticket,
            icon: <Wrench />,
            onSelect: onCreateTicket,
          } satisfies ActionMenuItem,
        ]
      : []),
    { key: "copy", label: labels.copy, icon: <Copy />, onSelect: onCopy },
    ...(canEdit
      ? [
          {
            key: "edit",
            label: labels.edit,
            icon: <Pencil />,
            onSelect: onEdit,
          } satisfies ActionMenuItem,
        ]
      : []),
    ...(canDelete
      ? [
          {
            key: "delete",
            label: labels.delete,
            icon: <Trash2 />,
            destructive: true,
            onSelect: onDelete,
          } satisfies ActionMenuItem,
        ]
      : []),
  ];

  return (
    <ActionMenu
      ariaLabel={labels.reply}
      items={items}
      trigger={
        <button
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={labels.reply}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      }
    />
  );
}

/** One row in the mobile long-press message action sheet. */
export function ActionSheetItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
        destructive && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** A pending or already-uploaded attachment shown in the composer, with an
 *  image thumbnail when available so you can see what you're about to send
 *  instead of just a filename. */
export function AttachmentChip({
  name,
  size,
  isImage: isImageKind,
  thumbnailUrl,
  file,
  fromOneDrive,
  onRemove,
  removeLabel,
}: {
  name: string;
  size?: number;
  isImage: boolean;
  thumbnailUrl?: string | null;
  file?: File;
  fromOneDrive?: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  const objectUrl = useMemo(
    () => (file && isImageKind ? URL.createObjectURL(file) : null),
    [file, isImageKind],
  );
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const src = thumbnailUrl ?? objectUrl;

  return (
    <div className="flex max-w-56 items-center gap-2 rounded-lg border border-border/60 bg-background py-1 pl-1 pr-2 text-xs">
      {isImageKind && src ? (
        <img src={src} alt="" className="size-8 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          {fromOneDrive ? (
            <Mark provider="onedrive" className="size-3.5" />
          ) : (
            <Paperclip className="size-3.5" />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {size != null && (
        <span className="shrink-0 tabular-nums text-muted-foreground">{formatFileSize(size)}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
