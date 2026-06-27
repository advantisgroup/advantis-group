"use client";

import { useMutation, useQuery } from "convex/react";
import { Paperclip, Pin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDateTime, initials } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";

function CreateDialog() {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const create = useMutation(api.announcements.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const departments = useQuery(api.users.departments) ?? [];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [guestVisible, setGuestVisible] = useState(false);
  const [audience, setAudience] = useState("all");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
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
      toast.error(e instanceof Error ? e.message : "Error");
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
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-3">
            <Input
              placeholder={tc("create")}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-11 text-base font-medium"
            />
            <Textarea
              placeholder={t("bodyLabel")}
              rows={6}
              value={body}
              onChange={e => setBody(e.target.value)}
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
          <Button
            onClick={submit}
            disabled={busy || !title.trim() || !body.trim()}
          >
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const me = useCurrentUser();
  const isManager = useIsManager();
  const announcements = useQuery(api.announcements.list, {});
  const markRead = useMutation(api.announcements.markRead);
  const remove = useMutation(api.announcements.remove);

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
            <Pin className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted-foreground">{t("title")}</p>
        </div>
      )}
      <div className="space-y-3">
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
              <div className="flex gap-3.5 p-4 pl-5">
                <Avatar className="mt-0.5 size-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials(a.authorName, a.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {a.pinned && (
                      <Pin
                        className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
                        aria-label={t("pinned")}
                      />
                    )}
                    <h2 className="truncate text-base font-semibold leading-tight">
                      {a.title}
                    </h2>
                    {!a.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        className="ml-auto size-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() => void remove({ announcementId: a._id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">
                      {a.authorName}
                    </span>{" "}
                    · {formatDateTime(a.publishedAt, locale)}
                  </p>
                  <div className="prose prose-sm mt-2.5 max-w-none text-sm dark:prose-invert prose-p:my-1.5 prose-headings:mt-3">
                    <Markdown remarkPlugins={[remarkGfm]}>{a.body}</Markdown>
                  </div>
                  {a.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
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
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
