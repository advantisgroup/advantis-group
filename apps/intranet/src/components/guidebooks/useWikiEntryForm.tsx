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
import { TagInput, type WikiEntry } from "@/components/guidebooks/WikiEntryDialogs";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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
import { addMonths, msToDateInput } from "@/lib/wiki";
import { attachPendingFiles } from "@/lib/wiki-attachments";

/**
 * The structured ("v2") wiki entry form — state, validation and submit, plus
 * the field stack as a ready-to-place node.
 *
 * Returned rather than rendered as a component with its own chrome so the
 * same form can sit in the edit dialog and in the full-screen composer
 * without either copy drifting from the other. The caller supplies the
 * surrounding shell and wires its own save button to `submit`.
 */
export function useWikiEntryForm({
  entry,
  onDone,
}: {
  entry: WikiEntry | "new";
  onDone: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const handleError = useErrorHandler();
  const categories = useQuery(api.wikiCategories.list) ?? [];
  const entries = useQuery(api.wikiEntries.list) ?? [];
  const create = useMutation(api.wikiEntries.create);
  const update = useMutation(api.wikiEntries.update);
  const addAttachment = useMutation(api.guidebookAttachments.add);
  const oneDriveApi = useOneDriveApi();
  const attachmentUpload = useAttachmentUpload();
  const isEditing = entry !== "new";

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
    attachmentUpload.reset();
    createdRef.current = null;
  }

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
      };
      if (isEditing) {
        await update({ entryId: entry._id, ...patch });
        toast.success(t("entryUpdated"));
      } else {
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
      }
      onDone();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const fields = (
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
        />
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
      {isEditing ? (
        <GuidebookAttachments slug={entry.slug} />
      ) : (
        <PendingWikiAttachments
          attachmentUpload={attachmentUpload}
          busy={busy}
          slugPreview={thema ? slugify(thema) : undefined}
        />
      )}
    </div>
  );

  return { fields, submit, busy };
}
