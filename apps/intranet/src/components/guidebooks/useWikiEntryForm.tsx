"use client";

import { useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { type ReadinessCheck, scoreReadiness } from "@/components/compose/Readiness";
import { useDraft } from "@/components/compose/use-draft";
import { GuidebookAttachments } from "@/components/guidebooks/GuidebookAttachments";
import { PendingWikiAttachments } from "@/components/guidebooks/PendingWikiAttachments";
import { staticGuidebookSlugs } from "@/components/guidebooks/registry";
import { PersonPicker, type PersonOption } from "@/components/people/PersonPicker";
import { TagInput, type WikiEntry } from "@/components/guidebooks/WikiEntryDialogs";
import { useCurrentUser } from "@/components/providers/current-user";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { htmlToText } from "@/components/ui/rich-text";
import { type FileLinkCandidate } from "@/components/ui/rich-text-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { slugify } from "@/lib/utils";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { WIKI_FOLDER_BASE } from "@/lib/onedrive-scopes";
import { isImage } from "@/lib/upload";
import { addMonths, msToDateInput } from "@/lib/wiki";
import { attachPendingFiles } from "@/lib/wiki-attachments";

const NOBODY: PersonOption[] = [];

/**
 * The "Details" fields shared by every wiki entry — everything except the
 * headline thema/erklaerung pair and the attachments picker, which the
 * composer places itself.
 */
function WikiEntryDetailFields({
  categoryId,
  setCategoryId,
  categories,
  ownerUserId,
  setOwnerUserId,
  tags,
  setTags,
  link,
  setLink,
  validFrom,
  setValidFrom,
  validUntil,
  setValidUntil,
  minRole,
  setMinRole,
}: {
  categoryId: string;
  setCategoryId: (v: string) => void;
  categories: { _id: Id<"wikiCategories">; name: string; color: string }[];
  ownerUserId: string;
  setOwnerUserId: (v: string) => void;
  tags: string[];
  setTags: (v: string[]) => void;
  link: string;
  setLink: (v: string) => void;
  validFrom: string;
  setValidFrom: (v: string) => void;
  validUntil: string;
  setValidUntil: (v: string) => void;
  minRole: WikiEntryAudience;
  setMinRole: (v: WikiEntryAudience) => void;
}) {
  const t = useTranslations("Guidebooks");
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldCategory")}
        </label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder={t("fieldCategoryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldOwner")}
        </label>
        <PersonPicker
          value={(ownerUserId || null) as Id<"users"> | null}
          onChange={(userId) => setOwnerUserId(userId ?? "")}
          label={t("fieldOwner")}
          placeholder={t("fieldOwnerPlaceholder")}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldAudience")}
        </label>
        <Select
          value={minRole || "everyone"}
          onValueChange={(v) => setMinRole(v === "everyone" ? "" : (v as WikiEntryAudience))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">{t("audienceEveryone")}</SelectItem>
            <SelectItem value="manager">{t("audienceManagers")}</SelectItem>
            <SelectItem value="admin">{t("audienceAdmins")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldTags")}
        </label>
        <TagInput tags={tags} onChange={setTags} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldLink")}
        </label>
        <Input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("fieldValidFrom")}
          </label>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("fieldValidUntil")}
          </label>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <div className="mt-1.5 flex gap-1.5">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValidUntil(msToDateInput(addMonths(Date.now(), m)))}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent"
              >
                {t("quickMonths", { count: m })}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Marks an entry as a policy everyone confirms, and — when an existing
 *  policy changes in a way that matters — asks everyone to confirm again. */
function PolicyFields({
  policy,
  setPolicy,
  askAgain,
  setAskAgain,
  wasPolicy,
}: {
  policy: boolean;
  setPolicy: (v: boolean) => void;
  askAgain: boolean;
  setAskAgain: (v: boolean) => void;
  wasPolicy: boolean;
}) {
  const t = useTranslations("Guidebooks");
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/70 p-3">
      <label className="flex items-start gap-3">
        <Switch checked={policy} onCheckedChange={setPolicy} className="mt-0.5" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t("policyToggle")}</span>
          <span className="block text-xs text-muted-foreground">{t("policyToggleHint")}</span>
        </span>
      </label>
      {policy && wasPolicy && (
        <label className="flex items-start gap-3">
          <Checkbox
            checked={askAgain}
            onCheckedChange={(v) => setAskAgain(v === true)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("policyAskAgain")}</span>
            <span className="block text-xs text-muted-foreground">{t("policyAskAgainHint")}</span>
          </span>
        </label>
      )}
    </div>
  );
}
/** "" = everyone signed in; otherwise the lowest role that may read it. */
export type WikiEntryAudience = "" | "manager" | "admin";

export interface WikiEntryValues {
  thema: string;
  erklaerung: string;
  categoryId: string;
  tags: string[];
  link: string;
  validFrom: string;
  validUntil: string;
  ownerUserId: string;
  /** Optional so a draft saved before these fields existed still restores. */
  policy?: boolean;
  askAgain?: boolean;
  /** Optional so a draft saved before this field existed still restores. */
  minRole?: WikiEntryAudience;
}

function initialValues(
  entry: WikiEntry | { draftId: string },
  currentUserId: string,
): WikiEntryValues {
  if ("draftId" in entry) {
    const now = Date.now();
    return {
      thema: "",
      erklaerung: "",
      categoryId: "",
      tags: [],
      link: "",
      validFrom: msToDateInput(now),
      validUntil: msToDateInput(addMonths(now, 3)),
      ownerUserId: currentUserId,
      policy: false,
      minRole: "",
    };
  }
  return {
    thema: entry.thema,
    erklaerung: entry.erklaerung,
    categoryId: entry.categoryId ?? "",
    tags: entry.tags,
    link: entry.link ?? "",
    validFrom: msToDateInput(entry.validFrom),
    validUntil: msToDateInput(entry.validUntil),
    ownerUserId: entry.ownerUserId,
    policy: entry.policy,
    askAgain: false,
    minRole: entry.minRole ?? "",
  };
}

/**
 * State, draft, readiness and submit for a wiki entry, new or existing — the
 * full-page composer is the only shell now, so this owns everything but the
 * layout. The draft is keyed per entry ("new" for a fresh one), restored
 * silently for a new entry and offered as a question for an existing one.
 */
export function useWikiEntryForm({
  entry,
  onDone,
}: {
  entry: WikiEntry | { draftId: Id<"drafts"> };
  /** Called with the entry's slug once a create/update fully succeeds
   *  (including any attachment upload phase). */
  onDone: (slug: string) => void;
}) {
  const t = useTranslations("Guidebooks");
  const handleError = useErrorHandler();
  const categories = useQuery(api.wiki.categories.list) ?? [];
  const users = useQuery(api.people.users.options, {}) ?? NOBODY;
  const currentUser = useCurrentUser();
  const entries = useQuery(api.wiki.entries.list) ?? [];
  const create = useMutation(api.wiki.entries.create);
  const update = useMutation(api.wiki.entries.update);
  const addAttachment = useMutation(api.guidebooks.attachments.add);
  const oneDriveApi = useOneDriveApi();
  const attachmentUpload = useAttachmentUpload();
  const isEditing = !("draftId" in entry);
  const entryKey: string = isEditing ? entry._id : entry.draftId;
  const existingAttachments = useQuery(
    api.guidebooks.attachments.list,
    isEditing ? { slug: entry.slug } : "skip",
  );

  const [values, setValues] = useState<WikiEntryValues>(() =>
    initialValues(entry, currentUser._id),
  );
  const [busy, setBusy] = useState(false);

  // Set once a "new" submission's create call succeeds; a retry after a
  // failed attachment phase then updates this same entry instead of
  // creating a second one under a suffixed slug.
  const createdRef = useRef<{ id: Id<"wikiEntries">; slug: string } | null>(null);

  const setters = useMemo(() => {
    const field =
      <K extends keyof WikiEntryValues>(key: K) =>
      (value: WikiEntryValues[K]) =>
        setValues((prev) => ({ ...prev, [key]: value }));
    return {
      setThema: field("thema"),
      setErklaerung: field("erklaerung"),
      setCategoryId: field("categoryId"),
      setTags: field("tags"),
      setLink: field("link"),
      setValidFrom: field("validFrom"),
      setValidUntil: field("validUntil"),
      setOwnerUserId: field("ownerUserId"),
      setPolicy: field("policy"),
      setAskAgain: field("askAgain"),
      setMinRole: field("minRole"),
    };
  }, []);

  const draft = useDraft<WikiEntryValues>({
    surface: "wikiEntry",
    subjectKey: entryKey,
    value: values,
    restore: isEditing ? "offer" : "auto",
    entitySavedAt: isEditing ? entry.updatedAt : undefined,
    isEmpty: (v) =>
      !isEditing &&
      !v.thema.trim() &&
      !htmlToText(v.erklaerung).trim() &&
      !v.categoryId &&
      v.tags.length === 0 &&
      !v.link.trim(),
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  const checks: ReadinessCheck[] = [
    { key: "thema", label: t("fieldThema"), done: !!values.thema.trim() },
    { key: "category", label: t("fieldCategory"), done: !!values.categoryId },
    { key: "validUntil", label: t("fieldValidUntil"), done: !!values.validUntil },
    {
      key: "erklaerung",
      label: t("fieldErklaerung"),
      done: htmlToText(values.erklaerung).trim().length > 0,
      optional: true,
    },
    { key: "tags", label: t("tagsFilterLabel"), done: values.tags.length > 0, optional: true },
  ];
  const readiness = scoreReadiness(checks);

  /** Back to the saved entry (or a blank one), and no draft left behind. */
  function discardChanges() {
    const fresh = initialValues(entry, currentUser._id);
    setValues(fresh);
    attachmentUpload.reset();
    void draft.clear(fresh);
  }

  // Files that can be linked into the body text right now — already-uploaded
  // attachments when editing, or the currently staged picks when composing a
  // new entry (matched back up by name once they're actually uploaded, see
  // `WikiFileLinkText`).
  const fileLinkCandidates: FileLinkCandidate[] = isEditing
    ? (existingAttachments ?? []).map((a) => ({ name: a.name, kind: a.kind }))
    : attachmentUpload.entries.map((e) => ({
        name: e.file.name,
        kind: isImage(e.file) ? "image" : "file",
      }));

  async function submit() {
    if (!readiness.canSubmit) {
      toast.error(t("entryFormIncomplete"));
      return;
    }
    setBusy(true);
    try {
      const patch = {
        categoryId: values.categoryId as Id<"wikiCategories">,
        thema: values.thema.trim(),
        erklaerung: values.erklaerung.trim(),
        tags: values.tags,
        link: values.link.trim() || undefined,
        validFrom: new Date(`${values.validFrom}T00:00:00`).getTime(),
        validUntil: new Date(`${values.validUntil}T00:00:00`).getTime(),
        ownerUserId: values.ownerUserId as Id<"users">,
        policy: values.policy || undefined,
        minRole: values.minRole || undefined,
      };
      if (isEditing) {
        await update({ entryId: entry._id, ...patch, askAgain: values.askAgain || undefined });
        await draft.clear();
        toast.success(t("entryUpdated"));
        onDone(entry.slug);
        return;
      }
      let slug: string;
      if (createdRef.current) {
        slug = createdRef.current.slug;
        await update({ entryId: createdRef.current.id, ...patch });
      } else {
        const taken = new Set([...entries.map((e) => e.slug), ...staticGuidebookSlugs()]);
        slug = slugify(values.thema);
        let suffix = 2;
        while (taken.has(slug)) {
          slug = `${slugify(values.thema)}-${suffix}`;
          suffix++;
        }
        const created = await create({ slug, ...patch });
        createdRef.current = { id: created.id, slug };
      }
      if (attachmentUpload.entries.length > 0) {
        attachmentUpload.setUploading(true);
        try {
          await attachPendingFiles(
            slug,
            attachmentUpload.entries.map((e) => e.file),
            oneDriveApi.attachToWiki,
            addAttachment,
            attachmentUpload.setFileProgress,
            attachmentUpload.removeByFile,
          );
          toast.success(t("uploadedTo", { path: `${WIKI_FOLDER_BASE}/${slug}` }));
        } finally {
          attachmentUpload.setUploading(false);
        }
      }
      await draft.clear();
      toast.success(t("entryCreated"));
      onDone(slug);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const optionsFields = (
    <>
      <WikiEntryDetailFields
        categoryId={values.categoryId}
        setCategoryId={setters.setCategoryId}
        categories={categories}
        ownerUserId={values.ownerUserId}
        setOwnerUserId={setters.setOwnerUserId}
        tags={values.tags}
        setTags={setters.setTags}
        link={values.link}
        setLink={setters.setLink}
        validFrom={values.validFrom}
        setValidFrom={setters.setValidFrom}
        validUntil={values.validUntil}
        setValidUntil={setters.setValidUntil}
        minRole={values.minRole ?? ""}
        setMinRole={setters.setMinRole}
      />
      <PolicyFields
        policy={values.policy ?? false}
        setPolicy={setters.setPolicy}
        askAgain={values.askAgain ?? false}
        setAskAgain={setters.setAskAgain}
        wasPolicy={isEditing && entry.policy}
      />
    </>
  );

  const attachmentsSlot = isEditing ? (
    <GuidebookAttachments slug={entry.slug} />
  ) : (
    <PendingWikiAttachments
      attachmentUpload={attachmentUpload}
      busy={busy}
      slugPreview={values.thema ? slugify(values.thema) : undefined}
    />
  );

  return {
    ...values,
    ...setters,
    categories,
    users,
    attachmentUpload,
    fileLinkCandidates,
    isEditing,
    entryKey,
    optionsFields,
    attachmentsSlot,
    submit,
    busy,
    draft,
    checks,
    readiness,
    discardChanges,
  };
}
