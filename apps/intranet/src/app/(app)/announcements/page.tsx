"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useMutation, useQuery } from "convex/react";
import { Eye, Megaphone, Paperclip, Pin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { htmlToText, RichText } from "@/components/ui/rich-text";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";

function CreateDialog() {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const create = useMutation(api.announcements.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();
  const departments = useQuery(api.users.departments) ?? [];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [guestVisible, setGuestVisible] = useState(false);
  const [audience, setAudience] = useState("all");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const hasBody = htmlToText(body).trim().length > 0;

  async function submit() {
    if (!title.trim() || !hasBody) return;
    setBusy(true);
    try {
      const attachmentStorageIds: Id<"_storage">[] = [];
      for (const file of files) {
        attachmentStorageIds.push(
          await uploadToConvex(() => generateUploadUrl({}), file)
        );
      }
      await create({
        title: title.trim(),
        body: body.trim(),
        pinned,
        audience:
          audience === "all"
            ? { kind: "all" }
            : { kind: "department", department: audience },
        attachmentStorageIds,
        guestVisible,
      });
      toast.success(t("new"));
      setOpen(false);
      setTitle("");
      setBody("");
      setFiles([]);
      setPinned(false);
      setGuestVisible(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-3">
            <Input
              placeholder={t("titlePlaceholder")}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-11 text-base font-medium"
            />
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder={t("bodyLabel")}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("audience")}
            </p>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("everyone")}</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d} value={d}>
                    {t("department")}: {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={pinned}
                  onChange={e => setPinned(e.target.checked)}
                />
                {t("pin")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={guestVisible}
                  onChange={e => setGuestVisible(e.target.checked)}
                />
                {t("guestVisible")}
              </label>
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                <Paperclip className="h-4 w-4" />
                {t("attachments")}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => setFiles(Array.from(e.target.files ?? []))}
                />
              </label>
            </div>
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files.map(f => f.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !hasBody}>
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewersPopover({
  announcementId,
  count,
}: {
  announcementId: Id<"announcements">;
  count: number;
}) {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const viewers = useQuery(
    api.announcements.viewers,
    open ? { announcementId } : "skip"
  );

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="tabular-nums">{t("viewedBy", { count })}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-72 w-60 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("viewedBy", { count })}
          </p>
          {viewers === undefined ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
          ) : viewers.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("noViews")}
            </p>
          ) : (
            viewers.map(v => (
              <div
                key={v.userId}
                className="flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <Avatar className="size-6">
                  {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
                  <AvatarFallback className="text-[9px]">
                    {initials(v.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">{v.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDateTime(v.readAt, locale)}
                </span>
              </div>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export default function AnnouncementsPage() {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const announcements = useQuery(api.announcements.list, {});
  const markRead = useMutation(api.announcements.markRead);
  const remove = useMutation(api.announcements.remove);
  const toggleReaction = useMutation(api.announcements.toggleReaction);
  const handleError = useErrorHandler();

  async function onDelete(id: Id<"announcements">) {
    const ok = await confirm({
      title: t("deleteConfirm"),
      description: tc("deleteWarning"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (ok) {
      try {
        await remove({ announcementId: id });
      } catch (e) {
        handleError(e);
      }
    }
  }

  // Visiting the feed marks any unread announcements as read.
  useEffect(() => {
    if (!announcements) return;
    for (const a of announcements) {
      if (!a.read) void markRead({ announcementId: a._id });
    }
  }, [announcements, markRead]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("title")}
        action={isManager ? <CreateDialog /> : undefined}
      />
      {announcements && announcements.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Megaphone className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      )}
      <div className="space-y-4">
        {announcements?.map(a => {
          const canDelete = a.authorId === me._id || me.role === "admin";
          return (
            <article
              key={a._id}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]",
                a.pinned && "border-primary/30"
              )}
            >
              {a.pinned && (
                <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
              )}
              {/* Header: author + title (left), date/time + actions (right) */}
              <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
                <Avatar className="size-9 shrink-0">
                  {a.authorAvatar && (
                    <AvatarImage src={a.authorAvatar} alt={a.authorName} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials(a.authorName, a.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {a.pinned && (
                      <Pin
                        className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
                        aria-label={t("pinned")}
                      />
                    )}
                    <h2 className="truncate font-display text-base font-semibold leading-tight">
                      {a.title}
                    </h2>
                    {!a.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {a.authorName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <time className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(a.publishedAt, locale)}
                  </time>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tc("delete")}
                      className="size-8 text-muted-foreground opacity-100 transition-opacity hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      onClick={() => void onDelete(a._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </header>

              {/* Styled message body */}
              <div className="px-5 py-4">
                <RichText html={a.body} />
                {a.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {a.attachments.map(att =>
                      att.url ? (
                        <a
                          key={att.storageId}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                        >
                          <Paperclip className="h-3 w-3" />
                          {t("attachments")}
                        </a>
                      ) : null
                    )}
                  </div>
                )}
              </div>

              {/* Reactions + viewed status */}
              <div className="flex items-center gap-2 border-t border-border/60 px-5 py-2.5">
                <ReactionPicker
                  side="top"
                  onPick={emoji =>
                    void toggleReaction({ announcementId: a._id, emoji })
                  }
                />
                <ReactionChips
                  reactions={a.reactions}
                  onToggle={emoji =>
                    void toggleReaction({ announcementId: a._id, emoji })
                  }
                />
                <div className="ml-auto">
                  <ViewersPopover announcementId={a._id} count={a.viewCount} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
