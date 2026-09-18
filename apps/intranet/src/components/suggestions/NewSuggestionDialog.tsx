"use client";

import { type ClipboardEvent, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttachmentList } from "@/components/attachments/AttachmentList";
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { FieldLabel, FormDialog } from "@/components/compose/FormDialog";
import { useDraft } from "@/components/compose/use-draft";
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
import { MAX_ATTACHMENT_BYTES } from "@/lib/upload";

interface SuggestionValues {
  categoryId: string;
  title: string;
  explanation: string;
  link: string;
}

const EMPTY_SUGGESTION: SuggestionValues = { categoryId: "", title: "", explanation: "", link: "" };

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

  const [values, setValues] = useState<SuggestionValues>(EMPTY_SUGGESTION);
  const [submitting, setSubmitting] = useState(false);
  // Pasted screenshots and picked files can't live in a draft, but the words
  // around them can.
  const draft = useDraft<SuggestionValues>({
    surface: "suggestion",
    subjectKey: "new",
    value: values,
    isEmpty: (v) => !v.title.trim() && !v.explanation.trim() && !v.link.trim(),
    onRestore: (stored) => setValues({ ...EMPTY_SUGGESTION, ...stored }),
  });

  const effectiveCategoryId = values.categoryId || categories?.[0]?._id || "";

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
    setSubmitting(true);
    try {
      const attachments = await upload.uploadAll();
      await createSuggestion({
        categoryId: effectiveCategoryId as Id<"suggestionCategories">,
        title: values.title.trim(),
        explanation: values.explanation.trim() || undefined,
        link: values.link.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      await draft.clear();
      toast.success(t("created"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("new")}
      contentClassName="max-w-lg"
      draft={draft}
      onStartOver={() => {
        setValues(EMPTY_SUGGESTION);
        upload.reset();
        void draft.clear(EMPTY_SUGGESTION);
      }}
      checks={[
        { key: "category", label: t("field_category"), done: !!effectiveCategoryId },
        { key: "title", label: t("field_title"), done: !!values.title.trim() },
        {
          key: "explanation",
          label: t("field_explanation"),
          done: !!values.explanation.trim(),
          optional: true,
        },
      ]}
      submitLabel={submitting ? t("submitting") : t("submit")}
      onSubmit={() => void save()}
      busy={submitting}
    >
      <label className="space-y-1.5">
        <FieldLabel>{t("field_category")}</FieldLabel>
        {categories && categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCategoriesYet")}</p>
        ) : (
          <Select
            value={effectiveCategoryId}
            onValueChange={(categoryId) => setValues((v) => ({ ...v, categoryId }))}
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
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder={t("titlePlaceholder")}
          autoFocus
        />
      </label>
      <label className="space-y-1.5">
        <FieldLabel>{t("field_explanation")}</FieldLabel>
        <Textarea
          value={values.explanation}
          onChange={(e) => setValues((v) => ({ ...v, explanation: e.target.value }))}
          onPaste={onPaste}
          placeholder={t("explanationPlaceholder")}
          className="min-h-24"
        />
      </label>
      <label className="space-y-1.5">
        <FieldLabel>{t("field_link")}</FieldLabel>
        <Input
          value={values.link}
          onChange={(e) => setValues((v) => ({ ...v, link: e.target.value }))}
          placeholder={t("linkPlaceholder")}
        />
      </label>
      <div className="space-y-1.5">
        <FieldLabel>{t("field_attachments")}</FieldLabel>
        <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
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
    </FormDialog>
  );
}

export function NewSuggestionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Mounted only while open, so each opening starts from the stored draft.
  if (!props.open) return null;
  return <NewSuggestionForm {...props} />;
}
