"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ChevronDown, Sparkles, Wrench, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { KNOWN_SYSTEMS, type UpdateType } from "@/lib/updates";

const TYPE_ICON = {
  incident: AlertTriangle,
  maintenance: Wrench,
  changelog: Sparkles,
} as const;

export default function NewUpdatePage() {
  const t = useTranslations("Updates");
  const tc = useTranslations("Common");
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const handleError = useErrorHandler();

  const departments = useQuery(api.users.departments) ?? [];
  const create = useMutation(api.updates.create);

  const [type, setType] = useState<UpdateType>("incident");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyFormat, setBodyFormat] = useState<"richtext" | "markdown">(
    "richtext"
  );
  const [body, setBody] = useState("");
  const [systems, setSystems] = useState<string[]>([]);
  const [customSystem, setCustomSystem] = useState("");
  const [audience, setAudience] = useState("all");
  const [publishAt, setPublishAt] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [emailRequested, setEmailRequested] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);

  const audienceValue = useMemo(
    () =>
      audience === "all"
        ? ({ kind: "all" } as const)
        : ({ kind: "department", department: audience } as const),
    [audience]
  );
  const emailPreview = useQuery(
    api.updates.previewEmailRecipients,
    emailRequested ? { audience: audienceValue } : "skip"
  );

  if (!isAdmin) return <ForbiddenScreen />;

  function toggleSystem(system: string) {
    setSystems(prev =>
      prev.includes(system) ? prev.filter(s => s !== system) : [...prev, system]
    );
  }

  function addCustomSystem() {
    const value = customSystem.trim();
    if (value && !systems.includes(value)) setSystems(prev => [...prev, value]);
    setCustomSystem("");
  }

  async function onSubmit() {
    if (!title.trim() || !summary.trim() || !body.trim()) {
      toast.error(t("fillRequiredFields"));
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await create({
        type,
        title: title.trim(),
        summary: summary.trim(),
        bodyFormat,
        body,
        audience: audienceValue,
        affectedSystems: type === "changelog" ? undefined : systems,
        startedAt: startedAt ? new Date(startedAt).getTime() : undefined,
        publishAt: publishAt ? new Date(publishAt).getTime() : undefined,
        emailRequested,
      });
      toast.success(t("published"));
      router.push(`/updates/${id}`);
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t("newUpdate")}
        description={t("newUpdateDescription")}
      />

      <div className="space-y-6">
        <div>
          <Label className="mb-2 block text-sm">{t("typeLabel")}</Label>
          <Tabs value={type} onValueChange={v => setType(v as UpdateType)}>
            <TabsList>
              {(["incident", "maintenance", "changelog"] as const).map(v => {
                const Icon = TYPE_ICON[v];
                return (
                  <TabsTrigger key={v} value={v} className="gap-1.5">
                    <Icon className="size-3.5" />
                    {t(`type.${v}`)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        <div>
          <Label htmlFor="update-title" className="mb-1.5 block text-sm">
            {t("titleLabel")}
          </Label>
          <Input
            id="update-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
          />
        </div>

        <div>
          <Label htmlFor="update-summary" className="mb-1.5 block text-sm">
            {t("summaryLabel")}
          </Label>
          <Textarea
            id="update-summary"
            value={summary}
            onChange={e => setSummary(e.target.value.slice(0, 140))}
            placeholder={t("summaryPlaceholder")}
            rows={2}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {summary.length}/140
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-sm">{t("bodyLabel")}</Label>
            <button
              type="button"
              onClick={() =>
                setBodyFormat(f => (f === "richtext" ? "markdown" : "richtext"))
              }
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {bodyFormat === "richtext"
                ? t("switchToMarkdown")
                : t("switchToRichText")}
            </button>
          </div>
          {bodyFormat === "richtext" ? (
            <RichTextEditor value={body} onChange={setBody} />
          ) : (
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t("markdownPlaceholder")}
              rows={10}
              className="font-mono text-sm"
            />
          )}
        </div>

        {type !== "changelog" && (
          <div>
            <Label className="mb-2 block text-sm">
              {t("affectedSystemsLabel")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {KNOWN_SYSTEMS.map(system => (
                <button
                  key={system}
                  type="button"
                  onClick={() => toggleSystem(system)}
                >
                  <Badge
                    variant={systems.includes(system) ? "default" : "outline"}
                  >
                    {system}
                  </Badge>
                </button>
              ))}
              {systems
                .filter(s => !(KNOWN_SYSTEMS as readonly string[]).includes(s))
                .map(system => (
                  <Badge key={system} variant="default" className="gap-1">
                    {system}
                    <button type="button" onClick={() => toggleSystem(system)}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={customSystem}
                onChange={e => setCustomSystem(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSystem();
                  }
                }}
                placeholder={t("customSystemPlaceholder")}
                className="h-8 max-w-56 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomSystem}
              >
                {t("addSystem")}
              </Button>
            </div>
          </div>
        )}

        <div>
          <Label className="mb-1.5 block text-sm">{t("audienceLabel")}</Label>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("everyone")}</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {type === "maintenance" && (
            <div>
              <Label className="mb-1.5 block text-sm">
                {t("startedAtLabel")}
              </Label>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={e => setStartedAt(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label className="mb-1.5 block text-sm">
              {t("publishAtLabel")}
            </Label>
            <Input
              type="datetime-local"
              value={publishAt}
              onChange={e => setPublishAt(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={emailRequested}
              onCheckedChange={c => setEmailRequested(c === true)}
            />
            {t("emailEveryoneLabel")}
          </label>

          {emailRequested && (
            <div className="mt-2 rounded-lg border border-border/70 p-3">
              {emailPreview === undefined ? (
                <p className="text-sm text-muted-foreground">{tc("loading")}</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRecipients(s => !s)}
                    className="flex w-full items-center justify-between gap-2 text-left text-sm"
                  >
                    <span>
                      {emailPreview.recipients.length === 0
                        ? t("emailPreviewNone")
                        : t("emailPreviewCount", {
                            count: emailPreview.recipients.length,
                          })}
                    </span>
                    {emailPreview.recipients.length > 0 && (
                      <ChevronDown
                        className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                          showRecipients ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </button>
                  {emailPreview.excludedNoConsent > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("emailPreviewExcluded", {
                        count: emailPreview.excludedNoConsent,
                      })}
                    </p>
                  )}
                  {showRecipients && emailPreview.recipients.length > 0 && (
                    <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto border-t border-border/60 pt-2">
                      {emailPreview.recipients.map(r => (
                        <li
                          key={r.userId}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">{r.name}</span>
                          <span className="shrink-0 truncate text-xs text-muted-foreground">
                            {r.email}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/70 pt-5">
          <Button variant="outline" onClick={() => router.push("/updates")}>
            {tc("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {publishAt && new Date(publishAt).getTime() > Date.now()
              ? t("schedule")
              : t("publish")}
          </Button>
        </div>
      </div>
    </div>
  );
}
