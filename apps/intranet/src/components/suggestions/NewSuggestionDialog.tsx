"use client";

import { type ClipboardEvent, type ReactNode, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { AttachmentList } from "@/components/attachments/AttachmentList";
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { MAX_ATTACHMENT_BYTES } from "@/lib/upload";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  saveLabel,
  saveDisabled,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  saveLabel: string;
  saveDisabled?: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const tc = useTranslations("Common");
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-2xl shadow-black/40 outline-none"
          >
            <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="shrink-0 border-b border-border/70 px-5 pb-3">
              <Drawer.Title className="font-display text-lg font-semibold leading-tight tracking-tight">
                {title}
              </Drawer.Title>
              {description && (
                <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {children}
            </div>
            <div
              className="flex shrink-0 gap-2 border-t border-border/70 px-5 pt-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            >
              <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button className="flex-1" disabled={saveDisabled} onClick={onSave}>
                {saveLabel}
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pr-12 pt-6">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-1 leading-relaxed">{description}</DialogDescription>
          )}
        </div>
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 pb-5 pt-4">
          {children}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={saveDisabled} onClick={onSave}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSuggestionForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Suggestions");
  const handleError = useErrorHandler();
  const categories = useQuery(api.suggestionCategories.list, {});
  const createSuggestion = useMutation(api.suggestions.create);
  const upload = useAttachmentUpload();

  const [categoryId, setCategoryId] = useState<Id<"suggestionCategories"> | "">(
    categories?.[0]?._id ?? "",
  );
  const [title, setTitle] = useState("");
  const [explanation, setExplanation] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const effectiveCategoryId = categoryId || categories?.[0]?._id || "";

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items ?? [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const named = new File(
            [file],
            `Screenshot_${new Date().toLocaleTimeString("de-DE").replace(/:/g, "-")}.png`,
            { type: file.type },
          );
          if (!upload.add([named])) {
            toast.error(t("attachmentsHint", { max: "3 MB" }));
          }
          e.preventDefault();
        }
      }
    }
  }

  async function save() {
    if (!title.trim() || !effectiveCategoryId) return;
    setSubmitting(true);
    try {
      const attachments = await upload.uploadAll();
      await createSuggestion({
        categoryId: effectiveCategoryId as Id<"suggestionCategories">,
        title: title.trim(),
        explanation: explanation.trim() || undefined,
        link: link.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      toast.success(t("created"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("new")}
      saveLabel={submitting ? t("submitting") : t("submit")}
      saveDisabled={submitting || !title.trim() || !effectiveCategoryId}
      onSave={() => void save()}
    >
      <label className="space-y-1.5">
        <FieldLabel>{t("field_category")}</FieldLabel>
        {categories && categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCategoriesYet")}</p>
        ) : (
          <Select
            value={effectiveCategoryId}
            onValueChange={(v) => setCategoryId(v as Id<"suggestionCategories">)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </label>
      <label className="space-y-1.5">
        <FieldLabel>{t("field_title")}</FieldLabel>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          autoFocus
        />
      </label>
      <label className="space-y-1.5">
        <FieldLabel>{t("field_explanation")}</FieldLabel>
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onPaste={onPaste}
          placeholder={t("explanationPlaceholder")}
          className="min-h-24"
        />
      </label>
      <label className="space-y-1.5">
        <FieldLabel>{t("field_link")}</FieldLabel>
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t("linkPlaceholder")}
        />
      </label>
      <div className="space-y-1.5">
        <FieldLabel>{t("field_attachments")}</FieldLabel>
        <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length > 0 && !upload.add(files)) {
                toast.error(t("attachmentsHint", { max: "5 MB" }));
              }
              e.target.value = "";
            }}
          />
          <span>
            {t("attachmentsHint", { max: `${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB` })}
          </span>
        </label>
        <AttachmentList
          entries={upload.entries}
          uploading={upload.uploading}
          onRemove={upload.remove}
          removeLabel={t("removeAttachment")}
        />
      </div>
    </DialogShell>
  );
}

export function NewSuggestionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Mounted only while open so each opening starts from a blank form.
  if (!props.open) return null;
  return <NewSuggestionForm {...props} />;
}
