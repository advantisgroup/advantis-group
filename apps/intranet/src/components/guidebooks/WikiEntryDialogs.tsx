"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { GuidebookAttachments } from "@/components/guidebooks/GuidebookAttachments";
import { PendingWikiAttachments } from "@/components/guidebooks/PendingWikiAttachments";
import { staticGuidebookSlugs } from "@/components/guidebooks/registry";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { addMonths, msToDateInput, slugify } from "@/lib/wiki";
import { attachPendingFiles } from "@/lib/wiki-attachments";

export type WikiEntry = NonNullable<
  ReturnType<typeof useQuery<typeof api.wikiEntries.list>>
>[number];

// --- Tag input ----------------------------------------------------------------

export function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [value, setValue] = useState("");

  function commit() {
    const v = value.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setValue("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-2">
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !value && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        className="min-w-[6rem] flex-1 border-none bg-transparent text-sm outline-none"
      />
    </div>
  );
}

// --- Category manager -----------------------------------------------------

export function CategoryManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const categories = useQuery(api.wikiCategories.list) ?? [];
  const createCategory = useMutation(api.wikiCategories.create);
  const renameCategory = useMutation(api.wikiCategories.rename);
  const cycleColor = useMutation(api.wikiCategories.cycleColor);
  const removeCategory = useMutation(api.wikiCategories.remove);
  const [newName, setNewName] = useState("");

  async function onAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCategory({ name });
      setNewName("");
    } catch (e) {
      handleError(e);
    }
  }

  async function onDelete(categoryId: Id<"wikiCategories">) {
    const ok = await confirm({
      title: t("deleteCategoryConfirm"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeCategory({ categoryId });
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("categoryManagerTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c._id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void cycleColor({ categoryId: c._id }).catch(handleError)}
                className="size-4 shrink-0 rounded-full transition-transform hover:scale-125"
                style={{ backgroundColor: c.color }}
                aria-label={t("cycleColor")}
              />
              <Input
                defaultValue={c.name}
                className="h-8"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== c.name) {
                    renameCategory({ categoryId: c._id, name: value }).catch(handleError);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void onDelete(c._id)}
                aria-label={tc("delete")}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Archive className="size-3.5 shrink-0" />
            {t("catFixedNote")}
          </div>
          <div className="flex gap-2 pt-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("addCategoryPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && void onAdd()}
              className="h-8"
            />
            <Button size="sm" onClick={() => void onAdd()}>
              <Plus className="mr-1 size-3.5" />
              {t("addCategory")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Create / edit entry dialog -----------------------------------------------

export function EntryDialog({
  entry,
  onOpenChange,
}: {
  entry: WikiEntry | null | "new";
  onOpenChange: (o: false) => void;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const categories = useQuery(api.wikiCategories.list) ?? [];
  const entries = useQuery(api.wikiEntries.list) ?? [];
  const create = useMutation(api.wikiEntries.create);
  const update = useMutation(api.wikiEntries.update);
  const addAttachment = useMutation(api.guidebookAttachments.add);
  const oneDriveApi = useOneDriveApi();
  const attachmentUpload = useAttachmentUpload();
  const isEditing = entry !== "new" && entry !== null;
  const open = entry !== null;

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

  // Re-seed the form whenever a different entry (or "new") opens.
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
  }

  async function onSubmit() {
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
        const taken = new Set([...entries.map((e) => e.slug), ...staticGuidebookSlugs()]);
        let slug = slugify(thema);
        let suffix = 2;
        while (taken.has(slug)) {
          slug = `${slugify(thema)}-${suffix}`;
          suffix++;
        }
        await create({ slug, ...patch });
        if (attachmentUpload.entries.length > 0) {
          attachmentUpload.setUploading(true);
          try {
            await attachPendingFiles(
              slug,
              attachmentUpload.entries.map((e) => e.file),
              oneDriveApi.attachToWiki,
              addAttachment,
              attachmentUpload.setFileProgress,
            );
          } finally {
            attachmentUpload.setUploading(false);
          }
        }
        toast.success(t("entryCreated"));
      }
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editEntryTitle") : t("newEntryTitle")}</DialogTitle>
        </DialogHeader>
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
          <div className="grid grid-cols-2 gap-3">
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
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
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
            <PendingWikiAttachments attachmentUpload={attachmentUpload} busy={busy} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
