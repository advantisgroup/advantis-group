"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ChevronDown, Sparkles, Wrench, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  DraftIndicator,
  DraftOfferBanner,
  DraftRestoredNote,
} from "@/components/compose/DraftIndicator";
import { MobileActionBar } from "@/components/compose/MobileActionBar";
import {
  type ReadinessCheck,
  ReadinessCard,
  ReadinessMeter,
  scoreReadiness,
} from "@/components/compose/Readiness";
import { ReadinessSubmit } from "@/components/compose/ReadinessSubmit";
import { useDraft } from "@/components/compose/use-draft";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { htmlToText } from "@/components/ui/rich-text";
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

interface UpdateValues {
  type: UpdateType;
  title: string;
  summary: string;
  bodyFormat: "richtext" | "markdown";
  body: string;
  systems: string[];
  audience: string;
  publishAt: string;
  startedAt: string;
  emailRequested: boolean;
}

const EMPTY_UPDATE: UpdateValues = {
  type: "incident",
  title: "",
  summary: "",
  bodyFormat: "richtext",
  body: "",
  systems: [],
  audience: "all",
  publishAt: "",
  startedAt: "",
  emailRequested: true,
};

function focusField(id: string) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.focus();
}

export default function NewUpdatePage() {
  const t = useTranslations("Updates");
  const tc = useTranslations("Common");
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const handleError = useErrorHandler();

  const departments = useQuery(api.users.departments) ?? [];
  const create = useMutation(api.updates.create);

  const [values, setValues] = useState<UpdateValues>(EMPTY_UPDATE);
  const [customSystem, setCustomSystem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);

  const set = <K extends keyof UpdateValues>(key: K, value: UpdateValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const draft = useDraft<UpdateValues>({
    surface: "update",
    subjectKey: "new",
    value: values,
    enabled: isAdmin,
    isEmpty: (v) =>
      !v.title.trim() && !v.summary.trim() && !htmlToText(v.body).trim() && v.systems.length === 0,
    onRestore: (stored) => setValues({ ...EMPTY_UPDATE, ...stored }),
  });

  const audienceValue = useMemo(
    () =>
      values.audience === "all"
        ? ({ kind: "all" } as const)
        : ({ kind: "department", department: values.audience } as const),
    [values.audience],
  );
  const emailPreview = useQuery(
    api.updates.previewEmailRecipients,
    isAdmin && values.emailRequested ? { audience: audienceValue } : "skip",
  );

  if (!isAdmin) return <ForbiddenScreen />;

  const bodyText = values.bodyFormat === "richtext" ? htmlToText(values.body) : values.body;
  const checks: ReadinessCheck[] = [
    {
      key: "title",
      label: t("checkTitle"),
      done: !!values.title.trim(),
      onFix: () => focusField("update-title"),
    },
    {
      key: "summary",
      label: t("checkSummary"),
      done: !!values.summary.trim(),
      onFix: () => focusField("update-summary"),
    },
    {
      key: "body",
      label: t("checkBody"),
      done: !!bodyText.trim(),
      onFix: () => focusField("update-body"),
    },
    ...(values.type !== "changelog"
      ? [
          {
            key: "systems",
            label: t("checkSystems"),
            done: values.systems.length > 0,
            optional: true,
            onFix: () => focusField("update-systems"),
          },
        ]
      : []),
  ];
  const readiness = scoreReadiness(checks);
  const scheduled = !!values.publishAt && new Date(values.publishAt).getTime() > Date.now();

  function toggleSystem(system: string) {
    setValues((prev) => ({
      ...prev,
      systems: prev.systems.includes(system)
        ? prev.systems.filter((s) => s !== system)
        : [...prev.systems, system],
    }));
  }

  function addCustomSystem() {
    const value = customSystem.trim();
    if (value && !values.systems.includes(value)) set("systems", [...values.systems, value]);
    setCustomSystem("");
  }

  function discard() {
    setValues(EMPTY_UPDATE);
    void draft.clear(EMPTY_UPDATE);
  }

  async function onSubmit() {
    if (!readiness.canSubmit) {
      toast.error(t("fillRequiredFields"));
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await create({
        type: values.type,
        title: values.title.trim(),
        summary: values.summary.trim(),
        bodyFormat: values.bodyFormat,
        body: values.body,
        audience: audienceValue,
        affectedSystems: values.type === "changelog" ? undefined : values.systems,
        startedAt: values.startedAt ? new Date(values.startedAt).getTime() : undefined,
        publishAt: values.publishAt ? new Date(values.publishAt).getTime() : undefined,
        emailRequested: values.emailRequested,
      });
      await draft.clear();
      toast.success(t("published"));
      router.push(`/updates/${id}`);
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeaderBar title={t("newUpdate")} description={t("newUpdateDescription")} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <DraftOfferBanner draft={draft} />
          <DraftRestoredNote draft={draft} onStartOver={discard} />

          <div>
            <Label className="mb-2 block text-sm">{t("typeLabel")}</Label>
            <Tabs value={values.type} onValueChange={(v) => set("type", v as UpdateType)}>
              <TabsList>
                {(["incident", "maintenance", "changelog"] as const).map((v) => {
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
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="update-summary" className="mb-1.5 block text-sm">
              {t("summaryLabel")}
            </Label>
            <Textarea
              id="update-summary"
              value={values.summary}
              onChange={(e) => set("summary", e.target.value.slice(0, 140))}
              placeholder={t("summaryPlaceholder")}
              rows={2}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {values.summary.length}/140
            </p>
          </div>

          <div id="update-body" tabIndex={-1} className="outline-none">
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-sm">{t("bodyLabel")}</Label>
              <button
                type="button"
                onClick={() =>
                  set("bodyFormat", values.bodyFormat === "richtext" ? "markdown" : "richtext")
                }
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {values.bodyFormat === "richtext" ? t("switchToMarkdown") : t("switchToRichText")}
              </button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{t("deepLinkHint")}</p>
            {values.bodyFormat === "richtext" ? (
              <RichTextEditor value={values.body} onChange={(v) => set("body", v)} />
            ) : (
              <Textarea
                value={values.body}
                onChange={(e) => set("body", e.target.value)}
                placeholder={t("markdownPlaceholder")}
                rows={10}
                className="font-mono text-sm"
              />
            )}
          </div>

          {values.type !== "changelog" && (
            <div id="update-systems" tabIndex={-1} className="outline-none">
              <Label className="mb-2 block text-sm">{t("affectedSystemsLabel")}</Label>
              <div className="flex flex-wrap gap-2">
                {KNOWN_SYSTEMS.map((system) => (
                  <button key={system} type="button" onClick={() => toggleSystem(system)}>
                    <Badge variant={values.systems.includes(system) ? "default" : "outline"}>
                      {system}
                    </Badge>
                  </button>
                ))}
                {values.systems
                  .filter((s) => !(KNOWN_SYSTEMS as readonly string[]).includes(s))
                  .map((system) => (
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
                  onChange={(e) => setCustomSystem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSystem();
                    }
                  }}
                  placeholder={t("customSystemPlaceholder")}
                  className="h-8 max-w-56 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addCustomSystem}>
                  {t("addSystem")}
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-sm">{t("audienceLabel")}</Label>
            <Select value={values.audience} onValueChange={(v) => set("audience", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("everyone")}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {values.type === "maintenance" && (
              <div>
                <Label className="mb-1.5 block text-sm">{t("startedAtLabel")}</Label>
                <Input
                  type="datetime-local"
                  value={values.startedAt}
                  onChange={(e) => set("startedAt", e.target.value)}
                />
              </div>
            )}
            <div>
              <Label className="mb-1.5 block text-sm">{t("publishAtLabel")}</Label>
              <Input
                type="datetime-local"
                value={values.publishAt}
                onChange={(e) => set("publishAt", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.emailRequested}
                onCheckedChange={(c) => set("emailRequested", c === true)}
              />
              {t("emailEveryoneLabel")}
            </label>

            {values.emailRequested && (
              <div className="mt-2 rounded-lg border border-border/70 p-3">
                {emailPreview === undefined ? (
                  <p className="text-sm text-muted-foreground">{tc("loading")}</p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRecipients((s) => !s)}
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
                        {emailPreview.recipients.map((r) => (
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
        </div>

        {/* Beside the form on desktop, so what's missing stays in view while
            scrolling a long update; below it on mobile. */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <ReadinessCard
            checks={checks}
            readyTitle={scheduled ? t("readyToSchedule") : t("readyToPublish")}
          />
          <div className="flex min-h-4 items-center px-1">
            <DraftIndicator draft={draft} onDiscard={discard} />
          </div>
          <div className="flex gap-2 max-md:hidden">
            <Button variant="secondary" className="flex-1" onClick={() => router.push("/updates")}>
              {tc("cancel")}
            </Button>
            <Button
              className="flex-1"
              onClick={() => void onSubmit()}
              disabled={submitting || !readiness.canSubmit}
            >
              {scheduled ? t("schedule") : t("publish")}
            </Button>
          </div>
        </aside>
      </div>

      <MobileActionBar>
        <ReadinessMeter checks={checks} className="mr-auto" />
        <ReadinessSubmit
          checks={checks}
          readyTitle={scheduled ? t("readyToSchedule") : t("readyToPublish")}
          busy={submitting}
          onSubmit={() => void onSubmit()}
        >
          {scheduled ? t("schedule") : t("publish")}
        </ReadinessSubmit>
      </MobileActionBar>
    </div>
  );
}
