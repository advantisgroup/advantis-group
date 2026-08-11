"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useWikiEntryForm } from "@/components/guidebooks/useWikiEntryForm";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

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
      details: [
        {
          label: tc("fieldName"),
          value: categories.find((c) => c._id === categoryId)?.name ?? "",
        },
      ],
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
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("categoryManagerTitle")}
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {tc("close")}
        </Button>
      }
    >
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
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
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
    </ResponsiveDialog>
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
  // The dialog is only the shell now — the form itself is shared with the
  // full-screen composer at /guidebooks/new so the two can't drift.
  if (entry === null) return null;
  return <EntryDialogInner entry={entry} onOpenChange={onOpenChange} />;
}

function EntryDialogInner({
  entry,
  onOpenChange,
}: {
  entry: WikiEntry | "new";
  onOpenChange: (o: false) => void;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const { fields, submit, busy } = useWikiEntryForm({
    entry,
    onDone: () => onOpenChange(false),
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onOpenChange(false)}
      title={entry === "new" ? t("newEntryTitle") : t("editEntryTitle")}
      contentClassName="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {tc("save")}
          </Button>
        </>
      }
    >
      {fields}
    </ResponsiveDialog>
  );
}
