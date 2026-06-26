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
import { useCurrentUser, useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
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
        <div className="space-y-4">
          <Input
            placeholder={tc("create")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder={t("bodyLabel")}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="space-y-1.5">
            <Label>{t("audience")}</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("everyone")}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {t("department")}: {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              {t("pin")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guestVisible}
                onChange={(e) => setGuestVisible(e.target.checked)}
              />
              {t("guestVisible")}
            </label>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <Paperclip className="h-4 w-4" />
              {t("attachments")}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
          </div>
          {files.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {files.map((f) => f.name).join(", ")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !body.trim()}>
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
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("title")}
        </p>
      )}
      <div className="space-y-4">
        {announcements?.map((a) => (
          <Card
            key={a._id}
            nested
            className={a.pinned ? "border-primary/40" : undefined}
          >
            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-center gap-2">
                {a.pinned && (
                  <Badge variant="muted" className="gap-1">
                    <Pin className="h-3 w-3" />
                    {t("pinned")}
                  </Badge>
                )}
                {!a.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                <h2 className="flex-1 text-lg font-semibold">{a.title}</h2>
                {(a.authorId === me._id || me.role === "admin") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    onClick={() => void remove({ announcementId: a._id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("by", { name: a.authorName })} ·{" "}
                {formatDateTime(a.publishedAt, locale)}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <Markdown remarkPlugins={[remarkGfm]}>{a.body}</Markdown>
              </div>
              {a.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {a.attachments.map((att) =>
                    att.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a
                        key={att.storageId}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <Paperclip className="h-3 w-3" />
                        {t("attachments")}
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
