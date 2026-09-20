"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type OneDriveItem } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Settings } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import {
  DraftIndicator,
  DraftOfferBanner,
  DraftRestoredNote,
} from "@/components/compose/DraftIndicator";
import { MobileActionBar } from "@/components/compose/MobileActionBar";
import { type ReadinessCheck, ReadinessCard, scoreReadiness } from "@/components/compose/Readiness";
import { useDraft } from "@/components/compose/use-draft";
import { Link } from "@/components/Link";
import { OneDrivePickerDialog } from "@/components/onedrive/OneDrivePickerDialog";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { htmlToText } from "@/components/ui/rich-text";
import { useRichTextController } from "@/components/ui/rich-text-controller";
import { RichTextSurface } from "@/components/ui/rich-text-editor";
import { RichTextToolbar } from "@/components/ui/rich-text-toolbar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type Announcement,
  type Draft,
  audienceValueOf,
  DRAFT_KEY,
  draftRelevantDateOf,
  EMPTY_DRAFT,
  migrateStoredDraft,
  msToLocalInput,
  relevantDateHasValidRange,
  relevantDateValueOf,
  sanitizeCategory,
} from "@/lib/announcements";
import {
  ANNOUNCEMENT_RELEVANT_DATE_SOURCE,
  formatRichDate,
  syncSourcedRichDateHtml,
} from "@/lib/rich-date";
import { isImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

import { AnnouncementPreview } from "./AnnouncementPreview";
import { ComposerOptionsFields } from "./ComposerOptionsFields";

// Where drafts lived before they moved to the server — read once, then removed.
const LEGACY_DRAFT_SAVED_AT_KEY = "announcements:draftSavedAt";
/** Every legacy exclusive audience kind (single department, or a plain user
 *  list) folds into the additive "mixed" model — saving afterwards naturally
 *  migrates the announcement to the new shape. */
function draftFromAnnouncement(editing: Announcement): Draft {
  const audience = editing.audience;
  return {
    title: editing.title,
    body: editing.body,
    pinned: editing.pinned,
    requiresAck: editing.requiresAck,
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
    relevantDate: editing.relevantDate ? draftRelevantDateOf(editing.relevantDate) : null,
  };
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

export function AnnouncementComposer(
  props: { editing: Announcement } | { editing: null; draftId: string },
) {
  const { editing } = props;
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  const isMobile = useIsMobile();
  const keyboardInset = useKeyboardInset();
  const handleError = useErrorHandler();

  const create = useMutation(api.announcements.create);
  const update = useMutation(api.announcements.update);
  const departments = useQuery(api.people.users.departments) ?? [];
  // Left as the raw (possibly-undefined) query result rather than falling
  // back to `?? []` here — a fresh `[]` on every render would defeat the
  // useMemo deps below that read them.
  const peopleQuery = useQuery(api.people.users.list, {});
  const announcementsQuery = useQuery(api.announcements.list, {});
  const attachmentUpload = useAttachmentUpload();

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of announcementsQuery ?? []) if (a.category) set.add(a.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [announcementsQuery]);

  // Seeded synchronously, not in an effect: the draft hook compares against
  // whatever the form holds when its stored copy arrives, and an effect-set
  // value could land a render late and be saved straight back as a "change".
  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftFromAnnouncement(editing) : EMPTY_DRAFT,
  );
  const [busy, setBusy] = useState(false);
  const [oneDrivePickerOpen, setOneDrivePickerOpen] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sendPromptOpen, setSendPromptOpen] = useState(false);
  const [view, setView] = useState<"write" | "preview">("write");
  const titleRef = useRef<HTMLInputElement>(null);

  // Whether the audience control was actually touched this session. An
  // existing "departmentId" audience (pre-dates this editor's picker, so it
  // can't be represented/re-selected here) must otherwise be left untouched —
  // saving an unrelated field change would silently replace it with `all`.
  const [audienceTouched, setAudienceTouched] = useState(false);
  const originalAudienceRef = useRef<Announcement["audience"] | null>(editing?.audience ?? null);

  const serverDraft = useDraft<Draft>({
    surface: "announcement",
    subjectKey: props.editing === null ? props.draftId : props.editing._id,
    value: draft,
    restore: editing ? "offer" : "auto",
    entitySavedAt: editing?.updatedAt ?? undefined,
    isEmpty: (d) =>
      !editing &&
      !d.title.trim() &&
      !htmlToText(d.body).trim() &&
      !d.category.trim() &&
      !d.relevantDate &&
      !d.publishAt &&
      !d.expiresAt,
    onRestore: (stored) => {
      setDraft({ ...EMPTY_DRAFT, ...migrateStoredDraft(stored) });
      if (editing) setAudienceTouched(true);
    },
  });

  // One-time move of a draft left in localStorage by the old composer.
  useEffect(() => {
    if (editing || !serverDraft.hydrated) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw && !serverDraft.restoredAt) {
        setDraft({ ...EMPTY_DRAFT, ...migrateStoredDraft(JSON.parse(raw)) });
      }
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(LEGACY_DRAFT_SAVED_AT_KEY);
    } catch {
      // An unreadable legacy draft isn't worth keeping.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDraft.hydrated]);

  const hasBody = htmlToText(draft.body).trim().length > 0;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (key === "audienceKind" || key === "audienceDepartments" || key === "audienceUserIds") {
      setAudienceTouched(true);
    }
    setDraft((d) => {
      if (key !== "relevantDate") return { ...d, [key]: value };
      const relevantDate = value as Draft["relevantDate"];
      const richDate = relevantDateValueOf(relevantDate);
      const body =
        relevantDate === null || !relevantDate.startAt
          ? syncSourcedRichDateHtml(d.body, ANNOUNCEMENT_RELEVANT_DATE_SOURCE, null)
          : richDate
            ? syncSourcedRichDateHtml(
                d.body,
                ANNOUNCEMENT_RELEVANT_DATE_SOURCE,
                richDate,
                formatRichDate(richDate, locale),
              )
            : d.body;
      return { ...d, relevantDate, body };
    });
  }

  function discardDraft() {
    const fresh = editing ? draftFromAnnouncement(editing) : EMPTY_DRAFT;
    setDraft(fresh);
    setAudienceTouched(false);
    attachmentUpload.reset();
    void serverDraft.clear(fresh);
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
    onSourcedDateChange: (source, value) => {
      if (source !== ANNOUNCEMENT_RELEVANT_DATE_SOURCE) return;
      setDraft((current) => ({
        ...current,
        relevantDate: draftRelevantDateOf(value),
      }));
    },
  });

  function insertRelevantDateIntoBody() {
    const value = relevantDateValueOf(draft.relevantDate);
    if (!value) return;
    controller.insertDate(value, formatRichDate(value, locale), ANNOUNCEMENT_RELEVANT_DATE_SOURCE);
    setOptionsOpen(false);
  }

  const audienceValue = useMemo(() => audienceValueOf(draft), [draft]);
  // A "mixed" audience with nothing picked yet (no department, no person)
  // reaches nobody — skip the misleading "reaches 0" preview until it does.
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

  const openOptions = () => {
    setSendPromptOpen(false);
    setOptionsOpen(true);
  };
  const checks: ReadinessCheck[] = [
    {
      key: "title",
      label: t("checkTitle"),
      done: draft.title.trim().length > 0,
      onFix: () => {
        setSendPromptOpen(false);
        setView("write");
        requestAnimationFrame(() => titleRef.current?.focus());
      },
    },
    { key: "body", label: t("checkBody"), done: hasBody },
    { key: "audience", label: t("audience"), done: audienceHasTarget, onFix: openOptions },
    ...(draft.relevantDate
      ? [
          {
            key: "date",
            label: t("checkDate"),
            done: relevantDateHasValidRange(draft.relevantDate),
            onFix: openOptions,
          },
        ]
      : []),
    {
      key: "category",
      label: t("checkCategory"),
      done: !!draft.category.trim(),
      optional: true,
      onFix: openOptions,
    },
  ];
  const readiness = scoreReadiness(checks);
  const canSend = readiness.canSubmit;
  const readyTitle = editing ? t("readyToSave") : t("readyToSend");

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
          requiresAck: draft.requiresAck ?? false,
          ...(keepOriginalAudience ? {} : { audience: audienceValue }),
          category: sanitizeCategory(draft.category),
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt).getTime() : null,
          relevantDate: relevantDateValueOf(draft.relevantDate) ?? null,
        });
        await serverDraft.clear();
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
            requiresAck: draft.requiresAck || undefined,
            audience: audienceValue,
            category: sanitizeCategory(draft.category) || undefined,
            attachments,
            publishAt: draft.publishAt ? new Date(draft.publishAt).getTime() : undefined,
            expiresAt: draft.expiresAt ? new Date(draft.expiresAt).getTime() : undefined,
            relevantDate: relevantDateValueOf(draft.relevantDate),
          });
          createdId = res.id;
        } catch (e) {
          await attachmentUpload.rollback(attachments);
          throw e;
        }
        await serverDraft.clear();
        toast.success(
          draft.publishAt && new Date(draft.publishAt).getTime() > Date.now()
            ? t("scheduledToast")
            : t("new"),
        );
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
  const showingPreview = view === "preview";
  const showDraftLine = serverDraft.savedAt !== null || serverDraft.status !== "idle";

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
      onInsertRelevantDate={insertRelevantDateIntoBody}
    />
  );

  // Ready: the last-look send prompt (pin, who it reaches). Not ready: the
  // verdict, with every missing item a tap away from its field.
  const sendPrompt = canSend ? (
    <QuickSendFields
      draft={draft}
      set={set}
      audienceCount={audienceCount}
      editing={!!editing}
      busy={busy}
      onConfirm={() => void submit()}
    />
  ) : (
    <ReadinessCard checks={checks} readyTitle={readyTitle} className="shadow-overlay" />
  );

  const optionsButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("options")}
      onClick={() => setOptionsOpen(true)}
      className="relative"
    >
      <Settings className="size-4" />
      {readiness.missing.some((c) => c.key === "audience" || c.key === "date") && (
        <span className="absolute right-2 top-2 size-1.5 rounded-full bg-warning" />
      )}
    </Button>
  );

  const viewToggle = (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
      {(["write", "preview"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            view === v
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "write" ? t("write") : t("preview")}
        </button>
      ))}
    </div>
  );

  const preview = (
    <AnnouncementPreview
      title={draft.title}
      body={draft.body}
      pinned={draft.pinned}
      authorName={me.name}
      authorAvatar={me.avatar}
      locale={locale}
      previews={previews}
      relevantDate={relevantDateValueOf(draft.relevantDate) ?? null}
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
          {showDraftLine && <DraftIndicator draft={serverDraft} onDiscard={discardDraft} />}
        </div>

        {!isMobile && (
          <>
            {viewToggle}
            {optionsButton}
            <Popover open={sendPromptOpen} onOpenChange={setSendPromptOpen}>
              <PopoverTrigger asChild>
                <Button disabled={busy}>{sendLabel}</Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className={cn(
                  canSend ? "w-72" : "w-[22rem] border-0 bg-transparent p-0 shadow-none",
                )}
              >
                {sendPrompt}
              </PopoverContent>
            </Popover>
          </>
        )}
      </header>

      {/* One column at reading width, not a permanent 50/50 split. The editor
          is unstyled and set at the size the announcement is read at, so a
          side-by-side preview was mostly a second copy of the left pane —
          it's a toggle now, and the page gets the other half of the screen. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {showingPreview ? (
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
              <div className="mx-auto w-full md:max-w-2xl">{preview}</div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full px-4 py-5 md:max-w-2xl md:px-10 md:py-8">
                  <DraftOfferBanner draft={serverDraft} className="mb-4" />
                  <DraftRestoredNote
                    draft={serverDraft}
                    onStartOver={discardDraft}
                    filesNotKept
                    className="mb-4"
                  />
                  <input
                    ref={titleRef}
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
                  style={{
                    // The layout viewport doesn't shrink for the keyboard, so
                    // sitting at the bottom of the column puts this bar behind
                    // it. Lift it by however much the keyboard covers.
                    marginBottom: keyboardInset,
                  }}
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
      </div>

      {isMobile && (
        <MobileActionBar inline>
          {viewToggle}
          {optionsButton}
          <span className="flex-1" />
          <Button disabled={busy} onClick={() => setSendPromptOpen(true)}>
            {sendLabel}
          </Button>
        </MobileActionBar>
      )}

      {isMobile ? (
        <MobileDrawer open={optionsOpen} onOpenChange={setOptionsOpen} ariaLabel={t("options")}>
          <div className="border-b border-border/70 px-5 pb-3">
            <p className="font-display text-lg font-semibold leading-tight tracking-tight">
              {t("options")}
            </p>
          </div>
          <div className="overflow-y-auto px-5 py-4">{optionsFields}</div>
        </MobileDrawer>
      ) : (
        <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
            <div className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5">
              <SheetTitle>{t("options")}</SheetTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("optionsHint")}</p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {optionsFields}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {isMobile && (
        <MobileDrawer open={sendPromptOpen} onOpenChange={setSendPromptOpen} ariaLabel={sendLabel}>
          <div className="px-5 pb-4">{sendPrompt}</div>
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
