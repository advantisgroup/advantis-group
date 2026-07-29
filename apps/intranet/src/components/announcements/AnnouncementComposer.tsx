"use client";

import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type OneDriveItem } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Building2,
  Check,
  Cloud,
  Paperclip,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttachmentList } from "@/components/attachments/AttachmentList";
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { OneDrivePickerDialog } from "@/components/onedrive/OneDrivePickerDialog";
import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { htmlToText } from "@/components/ui/rich-text";
import {
  RichTextSurface,
  RichTextToolbar,
  useRichTextController,
} from "@/components/ui/rich-text-editor";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { initials, relativeTime } from "@/lib/format";
import {
  type Announcement,
  audienceValueOf,
  CATEGORY_MAX_LENGTH,
  DRAFT_KEY,
  type Draft,
  EMPTY_DRAFT,
  migrateStoredDraft,
  msToLocalInput,
  sanitizeCategory,
} from "@/lib/announcements";
import { formatFileSize, isImage, MAX_ATTACHMENT_BYTES } from "@/lib/upload";
import { cn } from "@/lib/utils";

import { AnnouncementPreview } from "./AnnouncementPreview";

const DRAFT_SAVED_AT_KEY = "announcements:draftSavedAt";
const SPLIT_KEY = "announcements:composerSplit";

function clampSplit(pct: number): number {
  return Math.min(75, Math.max(25, pct));
}

/** Drag handle between the editor and preview panes — desktop only. */
function SplitDivider({
  containerRef,
  onResize,
  onReset,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  onResize: (pct: number) => void;
  onReset: () => void;
}) {
  const draggingRef = useRef(false);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      onResize(clampSplit(((e.clientX - rect.left) / rect.width) * 100));
    }
    function up() {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [containerRef, onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize editor and preview"
      onPointerDown={(e) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={onReset}
      className="group relative hidden w-2 shrink-0 cursor-col-resize md:block"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/60" />
    </div>
  );
}

/** Pin + audience readout shown right before an announcement actually goes out. */
function QuickSendFields({
  draft,
  set,
  audienceCount,
  editing,
  busy,
  onConfirm,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  audienceCount: number | undefined;
  editing: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{editing ? tc("save") : t("sendPromptTitle")}</p>
        {audienceCount !== undefined && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("willReach", { count: audienceCount })}
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox checked={draft.pinned} onCheckedChange={(v) => set("pinned", v === true)} />
        {t("pin")}
      </label>
      <Button className="w-full" disabled={busy} onClick={onConfirm}>
        {editing ? tc("save") : tc("send")}
      </Button>
    </div>
  );
}

/** A section wrapper giving the Options panel visual structure instead of a
 *  flat run of bare fields — a subtle card per group with its own heading. */
function OptionsSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ComposerOptionsFields({
  draft,
  set,
  editing,
  departments,
  peopleSearch,
  setPeopleSearch,
  filteredPeople,
  selectedPeople,
  toggleAudienceUser,
  toggleAudienceDepartment,
  audienceCount,
  existingCategories,
  attachmentUpload,
  addFiles,
  onOpenOneDrivePicker,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  editing: boolean;
  departments: string[];
  peopleSearch: string;
  setPeopleSearch: (v: string) => void;
  filteredPeople: { _id: string; name: string; email: string; avatar?: string | null }[];
  selectedPeople: { _id: string; name: string; email: string; avatar?: string | null }[];
  toggleAudienceUser: (userId: string) => void;
  toggleAudienceDepartment: (department: string) => void;
  audienceCount: number | undefined;
  existingCategories: string[];
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
  addFiles: (files: File[]) => boolean;
  onOpenOneDrivePicker: () => void;
}) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");

  const matchingCategories = existingCategories.filter((c) => {
    const q = draft.category.trim().toLowerCase();
    return !q || (c.toLowerCase().includes(q) && c.toLowerCase() !== q);
  });

  return (
    <div className="space-y-4">
      <OptionsSection label={t("category")}>
        <Input
          placeholder={t("categoryPlaceholder")}
          value={draft.category}
          onChange={(e) => set("category", e.target.value)}
          maxLength={CATEGORY_MAX_LENGTH}
        />
        {matchingCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {matchingCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("category", c)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/60 hover:bg-accent hover:text-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </OptionsSection>

      <OptionsSection label={t("audience")}>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" />
            {t("everyone")}
          </span>
          <Checkbox
            checked={draft.audienceKind === "all"}
            onCheckedChange={(v) => set("audienceKind", v === true ? "all" : "mixed")}
          />
        </label>

        {draft.audienceKind === "mixed" && (
          <div className="space-y-3 rounded-md border border-border/70 bg-background p-3">
            {departments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("departmentsLabel")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {departments.map((d) => {
                    const active = draft.audienceDepartments.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleAudienceDepartment(d)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-transparent bg-foreground text-background"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <Building2 className="size-3" />
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className={cn(
                "space-y-1.5",
                departments.length > 0 && "border-t border-border/60 pt-3",
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">{t("specificPeople")}</p>

              {selectedPeople.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPeople.map((p) => (
                    <span
                      key={p._id}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-accent/60 py-0.5 pl-1 pr-1.5 text-xs font-medium"
                    >
                      <Avatar className="size-4">
                        {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                        <AvatarFallback className="text-[8px]">
                          {initials(p.name, p.email)}
                        </AvatarFallback>
                      </Avatar>
                      {p.name}
                      <button
                        type="button"
                        aria-label={tc("delete")}
                        onClick={() => toggleAudienceUser(p._id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tc("search")}
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
                {filteredPeople.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">{tc("noResults")}</p>
                ) : (
                  filteredPeople.map((p) => (
                    <label
                      key={p._id}
                      className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-accent"
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
              </div>
            </div>
          </div>
        )}

        {audienceCount !== undefined && (
          <p className="text-xs text-muted-foreground">
            {t("willReach", { count: audienceCount })}
          </p>
        )}
      </OptionsSection>

      <OptionsSection label={t("options")}>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={draft.pinned} onCheckedChange={(v) => set("pinned", v === true)} />
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
      </OptionsSection>

      {!editing && (
        <OptionsSection label={t("attachments")}>
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
              onClick={onOpenOneDrivePicker}
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
        </OptionsSection>
      )}

      <OptionsSection label={t("scheduling")}>
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
      </OptionsSection>
    </div>
  );
}

export function AnnouncementComposer({ editing }: { editing: Announcement | null }) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  const isMobile = useIsMobile();
  const handleError = useErrorHandler();

  const create = useMutation(api.announcements.create);
  const update = useMutation(api.announcements.update);
  const departments = useQuery(api.users.departments) ?? [];
  // Left as the raw (possibly-undefined) query result rather than falling
  // back to `?? []` here — a fresh `[]` on every render would defeat the
  // useMemo deps below that read them.
  const peopleQuery = useQuery(api.users.list, {});
  const announcementsQuery = useQuery(api.announcements.list, {});
  const attachmentUpload = useAttachmentUpload();

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of announcementsQuery ?? []) if (a.category) set.add(a.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [announcementsQuery]);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [oneDrivePickerOpen, setOneDrivePickerOpen] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sendPromptOpen, setSendPromptOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const [splitPct, setSplitPct] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);

  // Whether the audience control was actually touched this session. An
  // existing "departmentId" audience (pre-dates this editor's picker, so it
  // can't be represented/re-selected here) must otherwise be left untouched —
  // saving an unrelated field change would silently replace it with `all`.
  const [audienceTouched, setAudienceTouched] = useState(false);
  const originalAudienceRef = useRef<Announcement["audience"] | null>(null);

  // Hydrate once on mount: edit mode from the announcement passed in, create
  // mode from the autosaved draft — `editing` is fixed for the life of this
  // route (a new id means a fresh navigation, which remounts this component).
  useEffect(() => {
    if (editing) {
      const audience = editing.audience;
      originalAudienceRef.current = audience;
      // Every legacy exclusive kind (single department, or a plain user
      // list) folds into the additive "mixed" model — saving the draft
      // afterwards naturally migrates the announcement to the new shape.
      setDraft({
        title: editing.title,
        body: editing.body,
        pinned: editing.pinned,
        guestVisible: false,
        category: editing.category ?? "",
        audienceKind: audience.kind === "all" ? "all" : "mixed",
        audienceDepartments:
          audience.kind === "department"
            ? [audience.department]
            : audience.kind === "mixed"
              ? audience.departments
              : [],
        audienceUserIds:
          audience.kind === "users"
            ? audience.userIds
            : audience.kind === "mixed"
              ? audience.userIds
              : [],
        publishAt: "",
        expiresAt: editing.expiresAt ? msToLocalInput(editing.expiresAt) : "",
      });
    } else {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          setDraft({ ...EMPTY_DRAFT, ...migrateStoredDraft(JSON.parse(raw)) });
          const savedAt = Number(localStorage.getItem(DRAFT_SAVED_AT_KEY));
          if (Number.isFinite(savedAt)) setLastSavedAt(savedAt);
        }
      } catch {
        setDraft(EMPTY_DRAFT);
      }
    }
    const rawSplit = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(rawSplit) && rawSplit >= 25 && rawSplit <= 75) setSplitPct(rawSplit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasBody = htmlToText(draft.body).trim().length > 0;
  const hasDraftContent = draft.title.trim().length > 0 || hasBody;

  // Autosave create-mode drafts. Always persists the full draft (not just
  // while title/body are non-empty) — otherwise clearing the body would skip
  // the write and leave a stale, already-deleted copy in storage, and an
  // audience/category/scheduling choice made before any text is typed would
  // never get saved at all.
  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      const now = Date.now();
      localStorage.setItem(DRAFT_SAVED_AT_KEY, String(now));
      setLastSavedAt(now);
    } catch {
      // Storage full/unavailable — the draft just isn't kept.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editing]);

  // Keep the "saved Xm ago" label fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (editing) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [editing]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (key === "audienceKind" || key === "audienceDepartments" || key === "audienceUserIds") {
      setAudienceTouched(true);
    }
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_SAVED_AT_KEY);
    } catch {
      // Storage unavailable — nothing to clean up.
    }
    setDraft(EMPTY_DRAFT);
    setLastSavedAt(null);
    attachmentUpload.reset();
  }

  function persistSplit(pct: number) {
    setSplitPct(pct);
    try {
      localStorage.setItem(SPLIT_KEY, String(pct));
    } catch {
      // Storage unavailable — the split just isn't remembered.
    }
  }

  const mentionCandidates = useMemo(
    () =>
      (peopleQuery ?? []).map((p) => ({
        id: p._id,
        name: p.name,
        email: p.email,
        avatar: p.avatar,
      })),
    [peopleQuery],
  );
  const controller = useRichTextController({
    value: draft.body,
    onChange: (v) => set("body", v),
    mentionCandidates,
  });

  const audienceValue = useMemo(() => audienceValueOf(draft), [draft]);
  // A "users" audience with nothing picked yet reaches nobody — skip the
  // (misleading) "reaches 0" preview until at least one person is selected.
  // A "mixed" audience with nothing picked yet (no department, no person)
  // reaches nobody — treat it the same as "all" being unset.
  const audienceHasTarget =
    draft.audienceKind === "all" ||
    draft.audienceDepartments.length > 0 ||
    draft.audienceUserIds.length > 0;
  const audienceCount = useQuery(
    api.announcements.audienceSize,
    audienceHasTarget ? { audience: audienceValue } : "skip",
  );

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    const mine = (peopleQuery ?? []).filter((p) => p._id !== me._id);
    if (!q) return mine;
    return mine.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [peopleQuery, peopleSearch, me._id]);

  // Selected people shown as removable chips regardless of the current
  // search text, so a pick made earlier doesn't visually disappear the
  // moment the search box filters it out of the list below.
  const selectedPeople = useMemo(() => {
    const all = peopleQuery ?? [];
    return draft.audienceUserIds
      .map((id) => all.find((p) => p._id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [peopleQuery, draft.audienceUserIds]);

  function toggleAudienceUser(userId: string) {
    setAudienceTouched(true);
    setDraft((d) => ({
      ...d,
      audienceUserIds: d.audienceUserIds.includes(userId)
        ? d.audienceUserIds.filter((id) => id !== userId)
        : [...d.audienceUserIds, userId],
    }));
  }

  function toggleAudienceDepartment(department: string) {
    setAudienceTouched(true);
    setDraft((d) => ({
      ...d,
      audienceDepartments: d.audienceDepartments.includes(department)
        ? d.audienceDepartments.filter((dep) => dep !== department)
        : [...d.audienceDepartments, department],
    }));
  }

  const canSend = draft.title.trim().length > 0 && hasBody && audienceHasTarget;

  const files = useMemo(
    () => attachmentUpload.entries.map((e) => e.file),
    [attachmentUpload.entries],
  );
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

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    try {
      if (editing) {
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
        router.push(`/announcements?id=${editing._id}`);
      } else {
        const attachments = await attachmentUpload.uploadAll();
        let createdId: string;
        try {
          const res = await create({
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
          createdId = res.id;
        } catch (e) {
          await attachmentUpload.rollback(attachments);
          throw e;
        }
        toast.success(
          draft.publishAt && new Date(draft.publishAt).getTime() > Date.now()
            ? t("scheduledToast")
            : t("new"),
        );
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(DRAFT_SAVED_AT_KEY);
        } catch {
          // Storage unavailable — nothing to clean up.
        }
        router.push(`/announcements?id=${createdId}`);
      }
      setSendPromptOpen(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const backHref = editing ? `/announcements?id=${editing._id}` : "/announcements";
  const sendLabel = editing ? tc("save") : tc("send");
  const showingPreview = isMobile && mobileView === "preview";

  const optionsFields = (
    <ComposerOptionsFields
      draft={draft}
      set={set}
      editing={!!editing}
      departments={departments}
      peopleSearch={peopleSearch}
      setPeopleSearch={setPeopleSearch}
      filteredPeople={filteredPeople}
      selectedPeople={selectedPeople}
      toggleAudienceUser={toggleAudienceUser}
      toggleAudienceDepartment={toggleAudienceDepartment}
      audienceCount={audienceCount}
      existingCategories={existingCategories}
      attachmentUpload={attachmentUpload}
      addFiles={addFiles}
      onOpenOneDrivePicker={() => setOneDrivePickerOpen(true)}
    />
  );

  const quickSendFields = (
    <QuickSendFields
      draft={draft}
      set={set}
      audienceCount={audienceCount}
      editing={!!editing}
      busy={busy}
      onConfirm={() => void submit()}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 md:px-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref} aria-label={tc("back")}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {editing ? t("edit") : t("new")}
          </p>
          {!editing && hasDraftContent && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Check className="size-3" />
              <span>
                {lastSavedAt
                  ? t("draftSaved", { time: relativeTime(lastSavedAt) })
                  : t("draftSaving")}
              </span>
              <button
                type="button"
                onClick={discardDraft}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {t("discardDraft")}
              </button>
            </div>
          )}
        </div>

        {isMobile && (
          <div className="mr-1 flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
            {(["write", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMobileView(v)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  mobileView === v
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "write" ? t("write") : t("preview")}
              </button>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label={t("options")}
          onClick={() => setOptionsOpen(true)}
        >
          <Settings className="size-4" />
        </Button>

        {isMobile ? (
          <Button disabled={!canSend || busy} onClick={() => setSendPromptOpen(true)}>
            {sendLabel}
          </Button>
        ) : (
          <Popover open={sendPromptOpen} onOpenChange={setSendPromptOpen}>
            <PopoverTrigger asChild>
              <Button disabled={!canSend || busy}>{sendLabel}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              {quickSendFields}
            </PopoverContent>
          </Popover>
        )}
      </header>

      <div ref={splitRef} className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-none"
          style={!isMobile ? { width: `${splitPct}%` } : undefined}
        >
          {showingPreview ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <AnnouncementPreview
                title={draft.title}
                body={draft.body}
                pinned={draft.pinned}
                authorName={me.name}
                authorAvatar={me.avatar}
                locale={locale}
                previews={previews}
              />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <div
                  className={cn(
                    "mx-auto w-full px-4 py-5 md:px-10 md:py-8",
                    !isMobile && "max-w-2xl",
                  )}
                >
                  <input
                    value={draft.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder={t("titlePlaceholder")}
                    className="w-full border-0 border-b border-transparent bg-transparent pb-2 font-display text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:border-border focus:outline-none md:text-3xl"
                  />
                  {!isMobile && (
                    <RichTextToolbar
                      controller={controller}
                      className="sticky top-0 z-10 -mx-1 mt-4 border-b border-border/60 bg-background/95 px-1 py-2 backdrop-blur"
                    />
                  )}
                  <RichTextSurface
                    controller={controller}
                    placeholder={t("bodyLabel")}
                    className={cn("min-h-[50vh]", !isMobile && "pt-4")}
                  />
                </div>
              </div>
              {isMobile && (
                <div
                  className="shrink-0 border-t border-border/70 bg-background/95 backdrop-blur"
                  style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                >
                  <RichTextToolbar
                    controller={controller}
                    className="flex-nowrap overflow-x-auto px-2 py-1.5"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {!isMobile && (
          <SplitDivider
            containerRef={splitRef}
            onResize={persistSplit}
            onReset={() => persistSplit(50)}
          />
        )}
        {!isMobile && (
          <div
            className="hidden min-h-0 flex-col overflow-y-auto border-l border-border/60 bg-muted/10 md:flex"
            style={{ width: `${100 - splitPct}%` }}
          >
            <div className="mx-auto w-full max-w-2xl px-6 py-8">
              <AnnouncementPreview
                title={draft.title}
                body={draft.body}
                pinned={draft.pinned}
                authorName={me.name}
                authorAvatar={me.avatar}
                locale={locale}
                previews={previews}
              />
            </div>
          </div>
        )}
      </div>

      {isMobile ? (
        <MobileDrawer open={optionsOpen} onOpenChange={setOptionsOpen} ariaLabel={t("options")}>
          <div className="border-b border-border/70 px-5 pb-3">
            <p className="font-display text-lg font-semibold leading-tight tracking-tight">
              {t("options")}
            </p>
          </div>
          <div className="px-5 py-4">{optionsFields}</div>
        </MobileDrawer>
      ) : (
        <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
            <SheetTitle>{t("options")}</SheetTitle>
            <div className="mt-2">{optionsFields}</div>
          </SheetContent>
        </Sheet>
      )}

      {isMobile && (
        <MobileDrawer open={sendPromptOpen} onOpenChange={setSendPromptOpen} ariaLabel={sendLabel}>
          <div className="px-5 pb-4">{quickSendFields}</div>
        </MobileDrawer>
      )}

      <OneDrivePickerDialog
        open={oneDrivePickerOpen}
        onOpenChange={setOneDrivePickerOpen}
        onSelect={addOneDriveFile}
      />
    </div>
  );
}
