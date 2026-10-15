"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

import {
  EMAIL_KATEGORIEN,
  PLACEHOLDERS,
  type EmailKategorie,
} from "@/components/applicants/email-templates";

type Template = Doc<"applicantEmailTemplates">;

/** HR's mail templates for applicants: list, edit, delete, and a one-click
 *  start with the built-in drafts while the list is empty. */
export function EmailTemplatesPanel() {
  const t = useTranslations("Applicants");
  const templates = useQuery(api.hr.emails.listTemplates);
  const createDefaults = useMutation(api.hr.emails.createDefaultTemplates);
  const remove = useMutation(api.hr.emails.removeTemplate);
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const [editing, setEditing] = useState<Template | "new" | null>(null);

  if (templates === undefined) return null;

  async function onRemove(template: Template) {
    const ok = await confirm({
      title: t("templateRemoveTitle", { name: template.name }),
      description: t("templateRemoveDescription"),
      confirmLabel: t("templateRemove"),
    });
    if (!ok) return;
    remove({ templateId: template._id }).catch(handleError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("templatesIntro")}</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t("templateNew")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<Mail />}
              title={t("templatesEmpty")}
              action={
                <Button
                  variant="outline"
                  onClick={() =>
                    createDefaults({})
                      .then(() => toast.success(t("templatesDefaultsCreated")))
                      .catch(handleError)
                  }
                >
                  {t("templatesCreateDefaults")}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        templates.map((template) => (
          <Card key={template._id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{template.name}</p>
                  <Badge variant="muted">{t(`emailKategorie.${template.kategorie}`)}</Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">{template.subject}</p>
                <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                  {template.body}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("templateEdit")}
                  onClick={() => setEditing(template)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("templateRemove")}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void onRemove(template)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {editing && (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const t = useTranslations("Applicants");
  const save = useMutation(api.hr.emails.saveTemplate);
  const handleError = useErrorHandler();
  const [name, setName] = useState(template?.name ?? "");
  const [kategorie, setKategorie] = useState<EmailKategorie>(template?.kategorie ?? "einladung");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await save({
        templateId: template?._id as Id<"applicantEmailTemplates"> | undefined,
        name,
        kategorie,
        subject,
        body,
      });
      toast.success(t("templateSaved"));
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={template ? t("templateEdit") : t("templateNew")}
      description={t("templatePlaceholderHint", { list: PLACEHOLDERS.join(" ") })}
      footer={
        <Button
          onClick={() => void onSave()}
          disabled={saving || !name.trim() || !subject.trim() || !body.trim()}
        >
          {t("templateSave")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">{t("templateName")}</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("templateKategorie")}</Label>
            <Select value={kategorie} onValueChange={(v) => setKategorie(v as EmailKategorie)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_KATEGORIEN.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`emailKategorie.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-subject">{t("templateSubject")}</Label>
          <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-body">{t("templateBody")}</Label>
          <Textarea
            id="tpl-body"
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
