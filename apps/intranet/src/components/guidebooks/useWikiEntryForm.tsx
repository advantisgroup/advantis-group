"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { GuidebookAttachments } from "@/components/guidebooks/GuidebookAttachments";
import { PendingWikiAttachments } from "@/components/guidebooks/PendingWikiAttachments";
import { staticGuidebookSlugs } from "@/components/guidebooks/registry";
import { useCurrentUser } from "@/components/providers/current-user";
import { TagInput, type WikiEntry } from "@/components/guidebooks/WikiEntryDialogs";
import { Input } from "@/components/ui/input";
import { type FileLinkCandidate, RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { slugify } from "@/lib/guidebook-blocks";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { WIKI_FOLDER_BASE } from "@/lib/onedrive-scopes";
import { isImage } from "@/lib/upload";
import { addMonths, msToDateInput } from "@/lib/wiki";
import { attachPendingFiles } from "@/lib/wiki-attachments";

/**
 * The "Details" fields shared by every wiki entry — everything except the
 * headline thema/erklaerung pair and the attachments picker, which their
 * callers place differently (inline in the edit dialog vs. tucked into the
 * full-screen composer's Options sheet).
 */
function WikiEntryDetailFields({
  categoryId,
  setCategoryId,
  categories,
  ownerUserId,
  setOwnerUserId,
  users,
  tags,
  setTags,
  link,
  setLink,
  validFrom,
  setValidFrom,
  validUntil,
  setValidUntil,
}: {
  categoryId: string;
  setCategoryId: (v: string) => void;
  categories: { _id: Id<"wikiCategories">; name: string; color: string }[];
  ownerUserId: Id<"users">;
  setOwnerUserId: (v: Id<"users">) => void;
  users: { _id: Id<"users">; name: string }[];
  tags: string[];
  setTags: (v: string[]) => void;
  link: string;
  setLink: (v: string) => void;
  validFrom: string;
  setValidFrom: (v: string) => void;
  validUntil: string;
  setValidUntil: (v: string) => void;
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
        <Select value={ownerUserId} onValueChange={(value) => setOwnerUserId(value as Id<"users">)}>
          <SelectTrigger>
            <SelectValue placeholder={t("fieldOwnerPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user._id} value={user._id}>
                {user.name}
              </SelectItem>
            ))}
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

/**
 * The structured ("v2") wiki entry form — state, validation and submit, plus
 * ready-to-place field bundles for the two shells that host it: the compact
 * edit dialog (`fields`, unchanged single stack) and the full-screen
 * composer (`optionsFields`/`attachmentsSlot` placed in its Options sheet,
 * the raw `thema`/`erklaerung` state driving its own headline layout).
 * Kept in one hook so neither shell's copy of this logic can drift from the
 * other's.
 */
export function useWikiEntryForm({
  entry,
  onDone,
}: {
  entry: WikiEntry | "new";
  /** Called with the entry's slug once a create/update fully succeeds
   *  (including any attachment upload phase). */
  onDone: (slug: string) => void;
}) {
  const t = useTranslations("Guidebooks");
  const handleError = useErrorHandler();
  const categories = useQuery(api.wikiCategories.list) ?? [];
  const users = useQuery(api.users.list, {}) ?? [];
  const currentUser = useCurrentUser();
  const entries = useQuery(api.wikiEntries.list) ?? [];
  const create = useMutation(api.wikiEntries.create);
  const update = useMutation(api.wikiEntries.update);
  const addAttachment = useMutation(api.guidebookAttachments.add);
  const oneDriveApi = useOneDriveApi();
  const attachmentUpload = useAttachmentUpload();
  const isEditing = entry !== "new";
  const existingAttachments = useQuery(
    api.guidebookAttachments.list,
    isEditing ? { slug: entry.slug } : "skip",
  );

  const [thema, setThema] = useState(isEditing ? entry.thema : "");
  const [erklaerung, setErklaerung] = useState(isEditing ? entry.erklaerung : "");
  const [categoryId, setCategoryId] = useState(isEditing ? (entry.categoryId ?? "") : "");
  const [tags, setTags] = useState<string[]>(isEditing ? entry.tags : []);
  const [link, setLink] = useState(isEditing ? (entry.link ?? "") : "");
  const [validFrom, setValidFrom] = useState(
    isEditing ? msToDateInput(entry.validFrom) : msToDateInput(Date.now()),
  );
  const [validUntil, setValidUntil] = useState(
    isEditing ? msToDateInput(entry.validUntil) : msToDateInput(addMonths(Date.now(), 3)),
  );
  const [ownerUserId, setOwnerUserId] = useState<Id<"users">>(
    isEditing ? (entry.ownerUserId as Id<"users">) : (currentUser._id as Id<"users">),
  );
  const [busy, setBusy] = useState(false);

  // Set once a "new" submission's create call succeeds; a retry after a
  // failed attachment phase then updates this same entry instead of
  // creating a second one under a suffixed slug.
  const createdRef = useRef<{ id: Id<"wikiEntries">; slug: string } | null>(null);

  // Re-seed whenever a different entry (or "new") is passed in.
  const [seededFor, setSeededFor] = useState(entry);
  if (entry !== seededFor) {
    setSeededFor(entry);
    setThema(isEditing ? entry.thema : "");
    setErklaerung(isEditing ? entry.erklaerung : "");
    setCategoryId(isEditing ? (entry.categoryId ?? "") : "");
    setTags(isEditing ? entry.tags : []);
    setLink(isEditing ? (entry.link ?? "") : "");
    setValidFrom(isEditing ? msToDateInput(entry.validFrom) : msToDateInput(Date.now()));
    setValidUntil(
      isEditing ? msToDateInput(entry.validUntil) : msToDateInput(addMonths(Date.now(), 3)),
    );
    setOwnerUserId(
      isEditing ? (entry.ownerUserId as Id<"users">) : (currentUser._id as Id<"users">),
    );
    attachmentUpload.reset();
    createdRef.current = null;
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
    if (!thema.trim() || !categoryId || !validUntil) {
      toast.error(t("entryFormIncomplete"));
      return;
    }
    setBusy(true);
    try {
      const patch = {
        categoryId: categoryId as Id<"wikiCategories">,
        thema: thema.trim(),
        erklaerung: erklaerung.trim(),
        tags,
        link: link.trim() || undefined,
        validFrom: new Date(`${validFrom}T00:00:00`).getTime(),
        validUntil: new Date(`${validUntil}T00:00:00`).getTime(),
        ownerUserId,
      };
      if (isEditing) {
        await update({ entryId: entry._id, ...patch });
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
        slug = slugify(thema);
        let suffix = 2;
        while (taken.has(slug)) {
          slug = `${slugify(thema)}-${suffix}`;
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
      toast.success(t("entryCreated"));
      onDone(slug);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const optionsFields = (
    <WikiEntryDetailFields
      categoryId={categoryId}
      setCategoryId={setCategoryId}
      categories={categories}
      ownerUserId={ownerUserId}
      setOwnerUserId={setOwnerUserId}
      users={users}
      tags={tags}
      setTags={setTags}
      link={link}
      setLink={setLink}
      validFrom={validFrom}
      setValidFrom={setValidFrom}
      validUntil={validUntil}
      setValidUntil={setValidUntil}
    />
  );

  const attachmentsSlot = isEditing ? (
    <GuidebookAttachments slug={entry.slug} />
  ) : (
    <PendingWikiAttachments
      attachmentUpload={attachmentUpload}
      busy={busy}
      slugPreview={thema ? slugify(thema) : undefined}
    />
  );

  const fields = (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldThema")}
        </label>
        <Input
          value={thema}
          onChange={(e) => setThema(e.target.value)}
          placeholder={t("fieldThemaPlaceholder")}
          autoFocus
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("fieldErklaerung")}
        </label>
        <RichTextEditor
          value={erklaerung}
          onChange={setErklaerung}
          placeholder={t("fieldErklaerungPlaceholder")}
          minHeight="8rem"
          fileLinkCandidates={fileLinkCandidates}
        />
      </div>
      {optionsFields}
      {attachmentsSlot}
    </div>
  );

  return {
    thema,
    setThema,
    erklaerung,
    setErklaerung,
    fileLinkCandidates,
    isEditing,
    optionsFields,
    attachmentsSlot,
    fields,
    submit,
    busy,
  };
}
