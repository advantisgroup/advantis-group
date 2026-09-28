"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { TEMPLATE_PLACEHOLDERS } from "@advantis/convex/marketing/inquiry";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, FileText, Lock, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// the marketing site's languages; a template can also fit any of them
const LOCALES = ["de", "en", "fr", "zh"] as const;
const ANY = "any";

type Template = Doc<"inquiryReplyTemplates">;
type Draft = { id?: Id<"inquiryReplyTemplates">; title: string; body: string; locale: string };

const EMPTY: Draft = { title: "", body: "", locale: ANY };

/**
 * The inbox's canned replies: one shared set for everyone who answers
 * website inquiries. Picked from "Templates" beside the reply box.
 */
export default function InquiryTemplatesPage() {
  const t = useTranslations("Inquiries.templates");
  const ti = useTranslations("Inquiries");
  const canManage = useHasCapability("manage_inquiries");
  const templates = useQuery(api.marketing.templates.list, canManage ? {} : "skip");
  const save = useMutation(api.marketing.templates.save);
  const remove = useMutation(api.marketing.templates.remove);
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (!canManage) return <EmptyState icon={<Lock />} title={ti("noAccess")} />;

  const edit = (template: Template) =>
    setDraft({
      id: template._id,
      title: template.title,
      body: template.body,
      locale: template.locale ?? ANY,
    });

  const submit = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const id = await save({
        id: draft.id,
        title: draft.title,
        body: draft.body,
        locale: draft.locale === ANY ? undefined : draft.locale,
      });
      setDraft({ ...draft, id });
      toast.success(t("saved"));
    } catch {
      toast.error(ti("actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const destroy = async (id: Id<"inquiryReplyTemplates">) => {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ id });
      if (draft?.id === id) setDraft(null);
      toast.success(t("deleted"));
    } catch {
      toast.error(ti("actionFailed"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<FileText />} />

      <Link
        href="/inquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {ti("back")}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <Button size="sm" variant="outline" className="w-full" onClick={() => setDraft(EMPTY)}>
            <Plus />
            {t("new")}
          </Button>
          {templates === undefined ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {templates.map((template) => (
                <li key={template._id}>
                  <button
                    type="button"
                    onClick={() => edit(template)}
                    className={cn(
                      "w-full px-2 py-2.5 text-left hover:bg-accent/50",
                      draft?.id === template._id && "bg-accent/60",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{template.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                        {template.locale ?? t("anyLanguageShort")}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {template.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {draft ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div>
                <label htmlFor="template-title" className="text-xs text-muted-foreground">
                  {t("name")}
                </label>
                <Input
                  id="template-title"
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder={t("namePlaceholder")}
                  className="mt-1"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("language")}</span>
                <Select
                  value={draft.locale}
                  onValueChange={(locale) => setDraft({ ...draft, locale })}
                >
                  <SelectTrigger className="mt-1 w-full" aria-label={t("language")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>{t("anyLanguage")}</SelectItem>
                    {LOCALES.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {t(`languages.${locale}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label htmlFor="template-body" className="text-xs text-muted-foreground">
                {t("text")}
              </label>
              <Textarea
                id="template-body"
                value={draft.body}
                rows={12}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                className="mt-1"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t("placeholdersHint")}{" "}
                {TEMPLATE_PLACEHOLDERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    title={t(`placeholders.${key}`)}
                    onClick={() => setDraft({ ...draft, body: `${draft.body}{${key}}` })}
                    className="mr-1.5 rounded bg-muted px-1 font-mono text-[11px] text-foreground hover:bg-accent"
                  >
                    {`{${key}}`}
                  </button>
                ))}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {draft.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void destroy(draft.id!)}
                >
                  <Trash2 />
                  {t("delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !draft.title.trim() || !draft.body.trim()}
                >
                  {t("save")}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <EmptyState icon={<FileText />} title={t("pickOne")} description={t("pickOneHint")} />
        )}
      </div>
    </div>
  );
}
