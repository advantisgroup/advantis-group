"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type OneDriveItem } from "@advantis/types";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link,
  Megaphone,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttachmentList } from "@/components/attachments/AttachmentList";
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { OneDrivePickerDialog } from "@/components/onedrive/OneDrivePickerDialog";
import { PageHeader } from "@/components/PageHeader";
import { isOwnerOrAdmin, useCurrentUser, useIsManager } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { htmlToText, RichText } from "@/components/ui/rich-text";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatTime, initials } from "@/lib/format";
import { pathToUrl } from "@/lib/onedrive-path";
import { formatFileSize, isImage, MAX_ATTACHMENT_BYTES } from "@/lib/upload";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";
import { CopyButton } from "@/components/activity/CopyButton";

type Announcement = FunctionReturnType<typeof api.announcements.list>[number];
type Audience =
  | { kind: "all" }
  | { kind: "department"; department: string }
  | { kind: "users"; userIds: Id<"users">[] };

const ALWAYS_PREVIEW_KEY = "announcements:alwaysPreview";
const DRAFT_KEY = "announcements:draft";

/** Sentinel value for the audience Select's "Specific people" option. */
const USERS_AUDIENCE_VALUE = "__users__";
/** Sentinel for the feed toolbar's category filter — distinct from any
 * category value an admin could actually type (including one literally
 * named "all"). Reserved: `sanitizeCategory` strips it back out if someone
 * types this exact string, so it can never collide with real data. */
const ALL_CATEGORIES_VALUE = "__all_categories__";
const CATEGORY_MAX_LENGTH = 40;

function sanitizeCategory(raw: string): string {
  const trimmed = raw.trim();
  return trimmed === ALL_CATEGORIES_VALUE ? "" : trimmed;
}

interface Draft {
  title: string;
  body: string;
  pinned: boolean;
  guestVisible: boolean;
  category: string;
  audienceKind: "all" | "department" | "users";
  audienceDepartment: string;
  audienceUserIds: string[];
  publishAt: string;
  expiresAt: string;
}

const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  pinned: false,
  guestVisible: false,
  category: "",
  audienceKind: "all",
  audienceDepartment: "",
  audienceUserIds: [],
  publishAt: "",
  expiresAt: "",
};

function msToLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Autosaved drafts from before the audience picker gained "audienceKind" /
 * "audienceDepartment" stored a single `audience` string ("all" or a
 * department name) instead. Translate that old shape so a still-pending
 * draft doesn't silently lose its department targeting on restore.
 */
function migrateStoredDraft(raw: unknown): Partial<Draft> {
  if (!raw || typeof raw !== "object") return {};
  const parsed = raw as Partial<Draft> & { audience?: string };
  if (parsed.audienceKind !== undefined || typeof parsed.audience !== "string") {
    return parsed;
  }
  const { audience, ...rest } = parsed;
  return {
    ...rest,
    audienceKind: audience === "all" ? "all" : "department",
    audienceDepartment: audience === "all" ? "" : audience,
  };
}

function EditorDialog({
  open,
  onOpenChange,
  editing,
  existingCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Announcement | null;
  /** Previously-used category values (across the currently loaded feed), offered as suggestions. */
  existingCategories: string[];
}) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
  const create = useMutation(api.announcements.create);
  const update = useMutation(api.announcements.update);
  const handleError = useErrorHandler();
  const departments = useQuery(api.users.departments) ?? [];
  const people = useQuery(api.users.list, open ? {} : "skip");
  const attachmentUpload = useAttachmentUpload();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [alwaysPreview, setAlwaysPreview] = useState(false);
  const [oneDrivePickerOpen, setOneDrivePickerOpen] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  // Whether the audience control was actually touched this session. An
  // existing "departmentId" audience (pre-dates this editor's picker, so it
  // can't be represented/re-selected here) must otherwise be left untouched —
  // saving an unrelated field change would silently replace it with `all`.
  const [audienceTouched, setAudienceTouched] = useState(false);
  const originalAudienceRef = useRef<Announcement["audience"] | null>(null);

  // Restore the "always preview" preference.
  useEffect(() => {
    setAlwaysPreview(localStorage.getItem(ALWAYS_PREVIEW_KEY) === "1");
  }, []);

  // Hydrate on open: edit mode from the announcement, create mode from the
  // autosaved draft so a closed dialog doesn't lose work.
  useEffect(() => {
    if (!open) return;
    setPreviewing(false);
    setAudienceTouched(false);
    if (editing) {
      const audience = editing.audience;
      originalAudienceRef.current = audience;
      setDraft({
        title: editing.title,
        body: editing.body,
        pinned: editing.pinned,
        guestVisible: false,
        category: editing.category ?? "",
        // "departmentId" audiences predate the per-user picker and aren't
        // editable here yet — fall back to "all" for display only; submit()
        // leaves the real audience alone unless the user touches this control.
        audienceKind:
          audience.kind === "users"
            ? "users"
            : audience.kind === "department"
              ? "department"
              : "all",
        audienceDepartment: audience.kind === "department" ? audience.department : "",
        audienceUserIds: audience.kind === "users" ? audience.userIds : [],
        publishAt: "",
        expiresAt: editing.expiresAt ? msToLocalInput(editing.expiresAt) : "",
      });
    } else {
      originalAudienceRef.current = null;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        setDraft(raw ? { ...EMPTY_DRAFT, ...migrateStoredDraft(JSON.parse(raw)) } : EMPTY_DRAFT);
      } catch {
        setDraft(EMPTY_DRAFT);
      }
    }
  }, [open, editing]);

  // Autosave create-mode drafts.
  useEffect(() => {
    if (!open || editing) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full/unavailable — the draft just isn't kept.
    }
  }, [draft, open, editing]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const audienceValue: Audience =
    draft.audienceKind === "department"
      ? { kind: "department", department: draft.audienceDepartment }
      : draft.audienceKind === "users"
        ? { kind: "users", userIds: draft.audienceUserIds as Id<"users">[] }
        : { kind: "all" };
  // A "users" audience with nothing picked yet reaches nobody — skip the
  // (misleading) "reaches 0" preview until at least one person is selected.
  const audienceCount = useQuery(
    api.announcements.audienceSize,
    open && (draft.audienceKind !== "users" || draft.audienceUserIds.length > 0)
      ? { audience: audienceValue }
      : "skip",
  );
  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    const mine = (people ?? []).filter((p) => p._id !== me._id);
    if (!q) return mine;
    return mine.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [people, peopleSearch, me._id]);

  function toggleAudienceUser(userId: string) {
    setAudienceTouched(true);
    setDraft((d) => ({
      ...d,
      audienceUserIds: d.audienceUserIds.includes(userId)
        ? d.audienceUserIds.filter((id) => id !== userId)
        : [...d.audienceUserIds, userId],
    }));
  }

  function toggleAlwaysPreview(v: boolean) {
    setAlwaysPreview(v);
    localStorage.setItem(ALWAYS_PREVIEW_KEY, v ? "1" : "0");
  }

  const hasBody = htmlToText(draft.body).trim().length > 0;
  const canSend =
    draft.title.trim().length > 0 &&
    hasBody &&
    (draft.audienceKind !== "users" || draft.audienceUserIds.length > 0);
  const files = useMemo(
    () => attachmentUpload.entries.map((e) => e.file),
    [attachmentUpload.entries],
  );

  // Object URLs for image previews; revoked when the file set changes.
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: isImage(file) ? URL.createObjectURL(file) : null,
      })),
    [files],
  );
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

  function addFiles(selected: File[]): boolean {
    const added = attachmentUpload.add(selected);
    if (!added) toast.error(t("attachTooLarge"));
    return added;
  }

  function addOneDriveFile(file: File, item: OneDriveItem) {
    if (!attachmentUpload.addOneDriveFile(file, item)) {
      toast.error(t("attachTooLarge"));
    }
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
      if (editing) {
        // A "departmentId" audience predates this picker and can't be
        // re-selected here — leave it alone unless the user actually changed
        // the audience control, so an unrelated edit (title, category, expiry)
        // doesn't silently widen it to "everyone".
        const keepOriginalAudience =
          originalAudienceRef.current?.kind === "departmentId" && !audienceTouched;
        await update({
          announcementId: editing._id,
          title: draft.title.trim(),
          body: draft.body.trim(),
          pinned: draft.pinned,
          ...(keepOriginalAudience ? {} : { audience: audienceValue }),
          category: sanitizeCategory(draft.category),
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt).getTime() : null,
        });
        toast.success(t("updated"));
      } else {
        // Uploads run in parallel with live per-file progress; a failure
        // here already rolls back whatever succeeded (see useAttachmentUpload).
        const attachments = await attachmentUpload.uploadAll();
        try {
          await create({
            title: draft.title.trim(),
            body: draft.body.trim(),
            pinned: draft.pinned,
            audience: audienceValue,
            category: sanitizeCategory(draft.category) || undefined,
            attachments,
            guestVisible: draft.guestVisible,
            publishAt: draft.publishAt ? new Date(draft.publishAt).getTime() : undefined,
            expiresAt: draft.expiresAt ? new Date(draft.expiresAt).getTime() : undefined,
          });
        } catch (e) {
          // The upload succeeded but `create` itself failed — clean up so
          // the attachments don't sit orphaned in storage.
          await attachmentUpload.rollback(attachments);
          throw e;
        }
        toast.success(
          draft.publishAt && new Date(draft.publishAt).getTime() > Date.now()
            ? t("scheduledToast")
            : t("new"),
        );
        localStorage.removeItem(DRAFT_KEY);
      }
      onOpenChange(false);
      setPreviewing(false);
      setDraft(EMPTY_DRAFT);
      attachmentUpload.reset();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{previewing ? t("preview") : editing ? t("edit") : t("new")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>

        {previewing ? (
          /* Preview — how the announcement will look to readers. */
          <div className="rounded-xl border border-border/70 bg-card">
            <header className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
              <Avatar className="h-9 w-9">
                {me.avatar && <AvatarImage src={me.avatar} alt={me.name} />}
                <AvatarFallback className="text-xs">{initials(me.name, "")}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {draft.pinned && <Pin className="size-3.5 text-primary" />}
                  <p className="truncate font-semibold">
                    {draft.title.trim() || t("titlePlaceholder")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {me.name} · {formatDateTime(Date.now(), locale)}
                </p>
              </div>
            </header>
            <div className="px-5 py-4">
              <RichText html={draft.body} />
              {previews.length > 0 && (
                <div className="mt-4 space-y-3">
                  {previews.some((p) => p.url) && (
                    <div className="flex flex-wrap gap-2">
                      {previews
                        .filter((p) => p.url)
                        .map((p) => (
                          <img
                            key={p.file.name}
                            src={p.url ?? ""}
                            alt={p.file.name}
                            className="max-h-60 w-auto max-w-full rounded-lg border border-border object-cover"
                          />
                        ))}
                    </div>
                  )}
                  {previews.some((p) => !p.url) && (
                    <div className="flex flex-wrap gap-2">
                      {previews
                        .filter((p) => !p.url)
                        .map((p) => (
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
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                className="h-11 text-base font-medium"
              />
              <RichTextEditor
                value={draft.body}
                onChange={(v) => set("body", v)}
                placeholder={t("bodyLabel")}
              />
            </div>

            <div className="space-y-5 rounded-lg border border-border/70 bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("category")}
                </Label>
                <Input
                  list="announcement-category-suggestions"
                  placeholder={t("categoryPlaceholder")}
                  value={draft.category}
                  onChange={(e) => set("category", e.target.value)}
                  maxLength={CATEGORY_MAX_LENGTH}
                />
                <datalist id="announcement-category-suggestions">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("audience")}
                </Label>
                <Select
                  value={
                    draft.audienceKind === "department"
                      ? draft.audienceDepartment
                      : draft.audienceKind === "users"
                        ? USERS_AUDIENCE_VALUE
                        : "all"
                  }
                  onValueChange={(v) => {
                    setAudienceTouched(true);
                    if (v === "all") setDraft((d) => ({ ...d, audienceKind: "all" }));
                    else if (v === USERS_AUDIENCE_VALUE)
                      setDraft((d) => ({ ...d, audienceKind: "users" }));
                    else
                      setDraft((d) => ({
                        ...d,
                        audienceKind: "department",
                        audienceDepartment: v,
                      }));
                  }}
                >
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
                    <SelectItem value={USERS_AUDIENCE_VALUE}>{t("specificPeople")}</SelectItem>
                  </SelectContent>
                </Select>
                {draft.audienceKind === "users" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                        <Users className="size-4" />
                        {draft.audienceUserIds.length > 0
                          ? t("peopleSelected", { count: draft.audienceUserIds.length })
                          : t("selectPeople")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <div className="border-b border-border/60 p-2">
                        <Input
                          autoFocus
                          placeholder={tc("search")}
                          value={peopleSearch}
                          onChange={(e) => setPeopleSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <ScrollArea className="h-64">
                        {filteredPeople.length === 0 ? (
                          <p className="p-3 text-xs text-muted-foreground">{tc("noResults")}</p>
                        ) : (
                          filteredPeople.map((p) => (
                            <label
                              key={p._id}
                              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-accent"
                            >
                              <Checkbox
                                checked={draft.audienceUserIds.includes(p._id)}
                                onCheckedChange={() => toggleAudienceUser(p._id)}
                              />
                              <Avatar className="size-6 shrink-0">
                                {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                                <AvatarFallback className="text-[10px]">
                                  {initials(p.name, p.email)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{p.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {p.email}
                                </span>
                              </span>
                            </label>
                          ))
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                )}
                {audienceCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {t("willReach", { count: audienceCount })}
                  </p>
                )}
              </div>

              <div className="space-y-2 border-t border-border/60 pt-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("options")}
                </Label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={draft.pinned}
                      onCheckedChange={(v) => set("pinned", v === true)}
                    />
                    {t("pin")}
                  </label>
                  {!editing && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={draft.guestVisible}
                        onCheckedChange={(v) => set("guestVisible", v === true)}
                      />
                      {t("guestVisible")}
                    </label>
                  )}
                </div>
              </div>

              {!editing && (
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("attachments")}
                  </Label>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                      <Paperclip className="h-4 w-4" />
                      {t("attachFile")}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files ?? []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setOneDrivePickerOpen(true)}
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Cloud className="h-4 w-4" />
                      {tc("fromOneDrive")}
                    </button>
                  </div>
                  {attachmentUpload.entries.length > 0 && (
                    <div className="space-y-1.5">
                      <AttachmentList
                        entries={attachmentUpload.entries}
                        uploading={attachmentUpload.uploading}
                        onRemove={attachmentUpload.remove}
                        removeLabel={tc("delete")}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {formatFileSize(attachmentUpload.totalSize)} /{" "}
                        {formatFileSize(MAX_ATTACHMENT_BYTES)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Scheduling: publish later and/or auto-expire. */}
              <div className="space-y-2 border-t border-border/60 pt-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("scheduling")}
                </Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {!editing && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("publishAtLabel")}</Label>
                      <Input
                        type="datetime-local"
                        value={draft.publishAt}
                        onChange={(e) => set("publishAt", e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("expiresAtLabel")}</Label>
                    <Input
                      type="datetime-local"
                      value={draft.expiresAt}
                      onChange={(e) => set("expiresAt", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 border-t border-border/60 pt-4 text-sm font-medium">
                <Checkbox
                  checked={alwaysPreview}
                  onCheckedChange={(v) => toggleAlwaysPreview(v === true)}
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
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button variant="outline" onClick={() => setPreviewing(true)} disabled={!canSend}>
                <Eye className="size-4" />
                {t("preview")}
              </Button>
              <Button onClick={handleSendClick} disabled={busy || !canSend}>
                {editing ? tc("save") : tc("create")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <OneDrivePickerDialog
        open={oneDrivePickerOpen}
        onOpenChange={setOneDrivePickerOpen}
        onSelect={addOneDriveFile}
      />
    </Dialog>
  );
}

function ViewersPopover({
  announcementId,
  count,
  total,
  canManage,
}: {
  announcementId: Id<"announcements">;
  count: number;
  /** Audience size — shown as "x / y" to the author/admins only. */
  total?: number;
  /** Author/admin gets a second tab listing who hasn't read it yet. */
  canManage: boolean;
}) {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"read" | "unread">("read");
  const viewers = useQuery(
    api.announcements.viewers,
    open && tab === "read" ? { announcementId } : "skip",
  );
  const nonReaders = useQuery(
    api.announcements.nonReaders,
    open && canManage && tab === "unread" ? { announcementId } : "skip",
  );

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTab("read");
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {total !== undefined ? t("readStats", { count, total }) : t("viewedBy", { count })}
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-80 w-64 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {canManage && (
            <div className="mb-1 grid grid-cols-2 gap-1 px-0.5 pb-1">
              <button
                type="button"
                onClick={() => setTab("read")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  tab === "read"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {t("viewedBy", { count })}
              </button>
              <button
                type="button"
                onClick={() => setTab("unread")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  tab === "unread"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {t("notReadYet")}
              </button>
            </div>
          )}
          {!canManage && (
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("viewedBy", { count })}
            </p>
          )}
          {tab === "read" ? (
            viewers === undefined ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
            ) : viewers.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">{t("noViews")}</p>
            ) : (
              viewers.map((v) => (
                <div key={v.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  <Avatar className="size-6">
                    {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
                    <AvatarFallback className="text-[9px]">{initials(v.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">{v.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDateTime(v.readAt, locale)}
                  </span>
                </div>
              ))
            )
          ) : nonReaders === undefined ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
          ) : nonReaders.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{t("everyoneRead")}</p>
          ) : (
            nonReaders.map((v) => (
              <div key={v.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Avatar className="size-6">
                  {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
                  <AvatarFallback className="text-[9px]">{initials(v.name)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">{v.name}</span>
              </div>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Collapses long bodies behind a "read more" toggle. */
function CollapsibleBody({ html }: { html: string }) {
  const t = useTranslations("Announcements");
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > 400);
  }, [html]);

  return (
    <div>
      <div
        ref={ref}
        className={cn("relative overflow-hidden", overflowing && !expanded && "max-h-80")}
      >
        <RichText html={html} />
        {overflowing && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" />
              {t("showLess")}
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" />
              {t("readMore")}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function AnnouncementCard({
  a,
  highlighted,
  onEdit,
  onDelete,
  onOpenImage,
}: {
  a: Announcement;
  highlighted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (url: string, name: string) => void;
}) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
  const markRead = useMutation(api.announcements.markRead);
  const toggleReaction = useMutation(api.announcements.toggleReaction);
  const canManage = isOwnerOrAdmin(me, a.authorId);
  const articleRef = useRef<HTMLElement>(null);

  // Deep link from a notification: scroll the matching card into view and
  // give it the same warm flash used elsewhere on landing.
  useEffect(() => {
    if (highlighted) {
      articleRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlighted]);

  // Mark as read only once the article has actually been scrolled into view —
  // keeps the unread dot and filter meaningful on long feeds.
  useEffect(() => {
    if (a.read || a.scheduled) return;
    const el = articleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void markRead({ announcementId: a._id });
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [a._id, a.read, a.scheduled, markRead]);

  return (
    <article
      ref={articleRef}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]",
        a.pinned && "border-primary/30",
        (a.scheduled || a.expired) && "opacity-80",
        highlighted && "deeplink-hl",
      )}
    >
      {a.pinned && <span className="absolute inset-y-0 left-0 w-1 bg-primary" />}
      {/* Header: author + title (left), date/time + actions (right) */}
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <Avatar className="size-9 shrink-0">
          {a.authorAvatar && <AvatarImage src={a.authorAvatar} alt={a.authorName} />}
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
            {a.category && (
              <Badge
                variant="muted"
                className="min-w-0 shrink gap-1 font-normal"
                title={a.category}
              >
                <Tag className="size-3 shrink-0" />
                <span className="truncate">{a.category}</span>
              </Badge>
            )}
            {!a.read && !a.scheduled && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
            {a.scheduled && (
              <Badge variant="warning" className="gap-1">
                <CalendarClock className="size-3" />
                {t("scheduledFor", {
                  date: formatDateTime(a.publishedAt, locale),
                })}
              </Badge>
            )}
            {a.expired && <Badge variant="muted">{t("expired")}</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {a.authorName}
            {a.updatedAt ? ` · ${t("edited")} ${formatTime(a.updatedAt, "de-DE")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton
            value={`https://intern.advantisgroup.de/announcements?id=${a._id}`}
            label="Copy announcement link"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <Link className="h-4 w-4" />
            </Button>
          </CopyButton>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("edit")}
                className="size-8 text-muted-foreground opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                onClick={onEdit}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tc("delete")}
                className="size-8 text-muted-foreground opacity-100 transition-opacity hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}

          <time className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDateTime(a.publishedAt, locale)}
          </time>
        </div>
      </header>

      {/* Styled message body */}
      <div className="px-5 py-4">
        <CollapsibleBody html={a.body} />
        {a.attachments.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Images embed inline */}
            {a.attachments.some((att) => att.kind === "image" && att.url) && (
              <div className="flex flex-wrap gap-2">
                {a.attachments
                  .filter((att) => att.kind === "image" && att.url)
                  .map((att) => {
                    const fromOneDrive = Boolean(att.oneDrivePath);
                    return fromOneDrive ? (
                      <a
                        key={att.storageId}
                        href={pathToUrl(att.oneDrivePath!)}
                        className="group/att relative block overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={att.url ?? ""}
                          alt={att.name}
                          className="max-h-60 w-auto max-w-full object-cover transition-transform duration-200 group-hover/att:scale-[1.02]"
                        />
                        <span
                          title={tc("fromOneDrive")}
                          className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-background/90 shadow ring-1 ring-border"
                        >
                          <Cloud className="size-3.5 text-blue-500" />
                        </span>
                      </a>
                    ) : (
                      <button
                        key={att.storageId}
                        type="button"
                        onClick={() => onOpenImage(att.url ?? "", att.name)}
                        className="group/att relative block overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={att.url ?? ""}
                          alt={att.name}
                          className="max-h-60 w-auto max-w-full object-cover transition-transform duration-200 group-hover/att:scale-[1.02]"
                        />
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Other files show as chips with name + type/size */}
            {a.attachments.some((att) => att.kind !== "image") && (
              <div className="flex flex-wrap gap-2">
                {a.attachments
                  .filter((att) => att.kind !== "image")
                  .map((att) => {
                    const fromOneDrive = Boolean(att.oneDrivePath);
                    return (
                      <a
                        key={att.storageId}
                        href={fromOneDrive ? pathToUrl(att.oneDrivePath!) : (att.url ?? undefined)}
                        target={fromOneDrive ? undefined : "_blank"}
                        rel={fromOneDrive ? undefined : "noreferrer"}
                        download={fromOneDrive ? undefined : att.name}
                        className="group/att flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-accent"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          {fromOneDrive ? (
                            <Cloud className="size-4 text-blue-500" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[14rem] truncate text-sm font-medium">
                            {att.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {fromOneDrive
                              ? tc("fromOneDrive")
                              : [
                                  att.contentType?.split("/")[1]?.toUpperCase(),
                                  att.size != null ? formatFileSize(att.size) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || t("attachments")}
                          </span>
                        </span>
                        {fromOneDrive ? (
                          <ExternalLink className="size-4 shrink-0 text-blue-500 opacity-0 transition-opacity group-hover/att:opacity-100" />
                        ) : (
                          <Download className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/att:opacity-100" />
                        )}
                      </a>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reactions + viewed status */}
      <div className="flex items-center gap-2 border-t border-border/60 px-5 py-2.5">
        <ReactionPicker
          side="top"
          onPick={(emoji) => void toggleReaction({ announcementId: a._id, emoji })}
        />
        <ReactionChips
          reactions={a.reactions}
          onToggle={(emoji) => void toggleReaction({ announcementId: a._id, emoji })}
        />
        <div className="ml-auto">
          <ViewersPopover
            announcementId={a._id}
            count={a.viewCount}
            total={canManage ? a.audienceCount : undefined}
            canManage={canManage}
          />
        </div>
      </div>
    </article>
  );
}

type Filter = "all" | "unread" | "pinned";
type Sort = "newest" | "reactions";

export default function AnnouncementsPage() {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const isManager = useIsManager();
  const confirm = useConfirm();
  const announcements = useQuery(api.announcements.list, {});
  const remove = useMutation(api.announcements.remove);
  const markAllRead = useMutation(api.announcements.markAllRead);
  const handleError = useErrorHandler();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_VALUE);
  const [sort, setSort] = useState<Sort>("newest");
  const [lightbox, setLightbox] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // Deep link from a notification: /announcements?id=<id> highlights the
  // matching card once the list has loaded.
  const highlightId = useDeepLinkId("id");

  // Deep link from the dashboard quick action: /announcements?new=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== null) {
      // window.location is only available post-mount; this is a one-time
      // sync from URL state, not a case of deriving state from props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(null);
      setDialogOpen(true);
      window.history.replaceState(null, "", "/announcements");
    }
  }, []);

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

  const unreadCount = (announcements ?? []).filter((a) => !a.read && !a.scheduled).length;

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of announcements ?? []) {
      if (a.category && a.category !== ALL_CATEGORIES_VALUE) set.add(a.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [announcements]);

  const filtered = useMemo(() => {
    let rows = announcements ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) =>
        [a.title, htmlToText(a.body), a.authorName].some((field) =>
          field.toLowerCase().includes(q),
        ),
      );
    }
    if (filter === "unread") rows = rows.filter((a) => !a.read && !a.scheduled);
    if (filter === "pinned") rows = rows.filter((a) => a.pinned);
    if (categoryFilter !== ALL_CATEGORIES_VALUE)
      rows = rows.filter((a) => a.category === categoryFilter);
    if (sort === "reactions") {
      const score = (a: Announcement) => a.reactions.reduce((sum, r) => sum + r.count, 0);
      rows = [...rows].sort((a, b) => score(b) - score(a));
    }
    return rows;
  }, [announcements, search, filter, categoryFilter, sort]);

  const pinnedRows = filtered.filter((a) => a.pinned);
  const otherRows = filtered.filter((a) => !a.pinned);

  const renderCard = (a: Announcement) => (
    <AnnouncementCard
      key={a._id}
      a={a}
      highlighted={a._id === highlightId}
      onEdit={() => {
        setEditing(a);
        setDialogOpen(true);
      }}
      onDelete={() => void onDelete(a._id)}
      onOpenImage={(url, name) => setLightbox({ url, name })}
    />
  );

  return (
    <div className="mx-auto max-w-3xl" data-tour="tour-announcements-list">
      <PageHeader
        title={t("title")}
        tourCheckpoint="announcements"
        action={
          isManager ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              data-tour="tour-announcements-new"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("new")}
            </Button>
          ) : undefined
        }
      />

      {/* Search, filters, sort, mark-all-read */}
      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        data-tour="tour-announcements-toolbar"
      >
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc("search")}
            className="pl-9"
          />
        </div>
        {(["all", "unread", "pinned"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "border-transparent bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t(`filter_${f}`)}
            {f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        ))}
        {existingCategories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES_VALUE}>{t("allCategories")}</SelectItem>
              {existingCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("sortNewest")}</SelectItem>
            <SelectItem value="reactions">{t("sortReactions")}</SelectItem>
          </SelectContent>
        </Select>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void markAllRead({})}
          >
            <CheckCheck className="mr-1.5 size-3.5" />
            {t("markAllRead")}
          </Button>
        )}
      </div>

      {announcements && announcements.length === 0 && (
        <EmptyState icon={<Megaphone />} title={t("empty")} />
      )}
      {announcements && announcements.length > 0 && filtered.length === 0 && (
        <EmptyState icon={<Search />} title={tc("noResults")} />
      )}

      <div className="space-y-6">
        {pinnedRows.length > 0 && otherRows.length > 0 ? (
          <>
            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pinnedSection")}
              </h2>
              {pinnedRows.map(renderCard)}
            </section>
            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("latestSection")}
              </h2>
              {otherRows.map(renderCard)}
            </section>
          </>
        ) : (
          <div className="space-y-4">{filtered.map(renderCard)}</div>
        )}
      </div>

      {/* Image lightbox */}
      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <EditorDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        existingCategories={existingCategories}
      />
    </div>
  );
}
