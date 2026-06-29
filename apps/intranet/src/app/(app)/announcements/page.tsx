"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useMutation, useQuery } from "convex/react";
import {
  Download,
  Eye,
  FileText,
  Megaphone,
  Paperclip,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useConfirm,
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
import {
  formatFileSize,
  isImage,
  type UploadedAttachment,
  uploadToConvex,
} from "@/lib/upload";

/** Combined attachment size ceiling for a single announcement. */
const MAX_ATTACH_BYTES = 5 * 1024 * 1024;
const ALWAYS_PREVIEW_KEY = "announcements:alwaysPreview";

function CreateDialog() {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
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
  const [previewing, setPreviewing] = useState(false);
  const [alwaysPreview, setAlwaysPreview] = useState(false);

  // Restore the "always preview" preference.
  useEffect(() => {
    setAlwaysPreview(localStorage.getItem(ALWAYS_PREVIEW_KEY) === "1");
  }, []);

  function toggleAlwaysPreview(v: boolean) {
    setAlwaysPreview(v);
    localStorage.setItem(ALWAYS_PREVIEW_KEY, v ? "1" : "0");
  }

  const hasBody = htmlToText(body).trim().length > 0;
  const canSend = title.trim().length > 0 && hasBody;
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  // Object URLs for image previews; revoked when the file set changes.
  const previews = useMemo(
    () =>
      files.map(file => ({
        file,
        url: isImage(file) ? URL.createObjectURL(file) : null,
      })),
    [files]
  );
  useEffect(
    () => () => previews.forEach(p => p.url && URL.revokeObjectURL(p.url)),
    [previews]
  );

  function addFiles(selected: File[]) {
    const next = [...files];
    for (const f of selected) {
      if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f);
    }
    if (next.reduce((s, f) => s + f.size, 0) > MAX_ATTACH_BYTES) {
      toast.error(t("attachTooLarge"));
      return;
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  /** Send button: divert to preview first when the user opted into it. */
  function handleSendClick() {
    if (!canSend) return;
    if (alwaysPreview && !previewing) {
      setPreviewing(true);
      return;
    }
    void submit();
  }

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    try {
      const attachments: UploadedAttachment[] = [];
      for (const file of files) {
        const storageId = await uploadToConvex(
          () => generateUploadUrl({}),
          file
        );
        attachments.push({
          storageId,
          kind: isImage(file) ? "image" : "file",
          name: file.name,
          size: file.size,
          contentType: file.type || undefined,
        });
      }
      await create({
        title: title.trim(),
        body: body.trim(),
        pinned,
        audience:
          audience === "all"
            ? { kind: "all" }
            : { kind: "department", department: audience },
        attachments,
        guestVisible,
      });
      toast.success(t("new"));
      setOpen(false);
      setPreviewing(false);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{previewing ? t("preview") : t("new")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>

        {previewing ? (
          /* Preview — how the announcement will look to readers. */
          <div className="rounded-xl border border-border/70 bg-card">
            <header className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
              <Avatar className="h-9 w-9">
                {me.avatar && <AvatarImage src={me.avatar} alt={me.name} />}
                <AvatarFallback className="text-xs">
                  {initials(me.name, "")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {pinned && <Pin className="size-3.5 text-primary" />}
                  <p className="truncate font-semibold">
                    {title.trim() || t("titlePlaceholder")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {me.name} · {formatDateTime(Date.now(), locale)}
                </p>
              </div>
            </header>
            <div className="px-5 py-4">
              <RichText html={body} />
              {previews.length > 0 && (
                <div className="mt-4 space-y-3">
                  {previews.some(p => p.url) && (
                    <div className="flex flex-wrap gap-2">
                      {previews
                        .filter(p => p.url)
                        .map(p => (
                          <img
                            key={p.file.name}
                            src={p.url ?? ""}
                            alt={p.file.name}
                            className="max-h-60 w-auto max-w-full rounded-lg border border-border object-cover"
                          />
                        ))}
                    </div>
                  )}
                  {previews.some(p => !p.url) && (
                    <div className="flex flex-wrap gap-2">
                      {previews
                        .filter(p => !p.url)
                        .map(p => (
                          <span
                            key={p.file.name}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2"
                          >
                            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                              <FileText className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block max-w-[14rem] truncate text-sm font-medium">
                                {p.file.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {formatFileSize(p.file.size)}
                              </span>
                            </span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
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
                    onChange={e => {
                      addFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {files.length > 0 && (
                <div className="space-y-1.5">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs"
                    >
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatFileSize(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={tc("delete")}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    {formatFileSize(totalSize)} /{" "}
                    {formatFileSize(MAX_ATTACH_BYTES)}
                  </p>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 border-t border-border/60 pt-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={alwaysPreview}
                  onChange={e => toggleAlwaysPreview(e.target.checked)}
                />
                {t("alwaysPreview")}
              </label>
            </div>
          </div>
        )}

        <DialogFooter>
          {previewing ? (
            <>
              <Button variant="ghost" onClick={() => setPreviewing(false)}>
                {t("backToEdit")}
              </Button>
              <Button onClick={() => void submit()} disabled={busy || !canSend}>
                {tc("send")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreviewing(true)}
                disabled={!canSend}
              >
                <Eye className="size-4" />
                {t("preview")}
              </Button>
              <Button onClick={handleSendClick} disabled={busy || !canSend}>
                {tc("create")}
              </Button>
            </>
          )}
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
    <div className="mx-auto max-w-3xl" data-tour="tour-announcements-list">
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
                  <div className="mt-4 space-y-3">
                    {/* Images embed inline */}
                    {a.attachments.some(
                      att => att.kind === "image" && att.url
                    ) && (
                      <div className="flex flex-wrap gap-2">
                        {a.attachments
                          .filter(att => att.kind === "image" && att.url)
                          .map(att => (
                            <a
                              key={att.storageId}
                              href={att.url ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="group/att block overflow-hidden rounded-lg border border-border"
                            >
                              <img
                                src={att.url ?? ""}
                                alt={att.name}
                                className="max-h-60 w-auto max-w-full object-cover transition-transform duration-200 group-hover/att:scale-[1.02]"
                              />
                            </a>
                          ))}
                      </div>
                    )}

                    {/* Other files show as chips with name + type/size */}
                    {a.attachments.some(att => att.kind !== "image") && (
                      <div className="flex flex-wrap gap-2">
                        {a.attachments
                          .filter(att => att.kind !== "image")
                          .map(att => (
                            <a
                              key={att.storageId}
                              href={att.url ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              download={att.name}
                              className="group/att flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-accent"
                            >
                              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                                <FileText className="size-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block max-w-[14rem] truncate text-sm font-medium">
                                  {att.name}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {[
                                    att.contentType
                                      ?.split("/")[1]
                                      ?.toUpperCase(),
                                    att.size != null
                                      ? formatFileSize(att.size)
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || t("attachments")}
                                </span>
                              </span>
                              <Download className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/att:opacity-100" />
                            </a>
                          ))}
                      </div>
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
