"use client";

import { useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, Mail, Sparkles, Trash2, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichText } from "@/components/ui/rich-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { UpdateArtBanner } from "@/components/updates/UpdateArtBanner";
import { UpdateMarkdown } from "@/components/updates/UpdateMarkdown";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useNow } from "@/hooks/use-now";
import { formatDateTime, initials } from "@/lib/format";
import { formatDuration, statusesForType, type UpdateType } from "@/lib/updates";

import type { FunctionReturnType } from "convex/server";

const TYPE_ICON = {
  incident: AlertTriangle,
  maintenance: Wrench,
  changelog: Sparkles,
} as const;

const TYPE_BADGE_VARIANT = {
  incident: "destructive",
  maintenance: "warning",
  changelog: "success",
} as const;

type UpdateDetail = FunctionReturnType<typeof api.updates.updates.get>;
type UpdateData = NonNullable<UpdateDetail>;

function StatusCard({
  data,
  t,
  locale,
}: {
  data: UpdateData;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const now = useNow(true, 30_000);
  const startedAt = data.startedAt ?? data.publishedAt;
  const durationMs = (data.resolvedAt ?? now) - startedAt;
  return (
    <Card className="mb-6">
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("statusLabel")}
          </p>
          <Badge variant={data.resolvedAt ? "muted" : "warning"} className="mt-1">
            {data.status ? t(`status.${data.status}`) : "—"}
          </Badge>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("durationLabel")}
          </p>
          <p className="mt-1 text-sm font-medium">{formatDuration(durationMs)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("startedLabel")}
          </p>
          <p className="mt-1 text-sm">{formatDateTime(startedAt, locale)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("resolvedLabel")}
          </p>
          <p className="mt-1 text-sm">
            {data.resolvedAt ? formatDateTime(data.resolvedAt, locale) : t("ongoing")}
          </p>
        </div>
        {data.affectedSystems.length > 0 && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("affectedSystemsLabel")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.affectedSystems.map((s) => (
                <Badge key={s} variant="outline" className="min-w-0 max-w-full break-words">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function UpdateDetailPage() {
  const params = useParams<{ id: string }>();
  const updateId = params.id as Id<"updates">;
  const t = useTranslations("Updates");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const data = useQuery(api.updates.updates.get, { updateId });
  const addTimeline = useMutation(api.updates.updates.addTimelineEntry);
  const removeUpdate = useMutation(api.updates.updates.remove);

  const [message, setMessage] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("none");
  const [posting, setPosting] = useState(false);

  if (data === undefined) {
    return (
      <div className="px-4 pt-6 md:px-8 md:pt-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="px-4 pt-6 md:px-8 md:pt-8">
        <div className="mx-auto max-w-3xl space-y-2 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("notFoundTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("notFoundDescription")}</p>
        </div>
      </div>
    );
  }

  const Icon = TYPE_ICON[data.type];

  async function postTimelineEntry() {
    if (!message.trim()) return;
    setPosting(true);
    try {
      await addTimeline({
        updateId,
        message: message.trim(),
        status: nextStatus === "none" ? undefined : (nextStatus as never),
      });
      setMessage("");
      setNextStatus("none");
      toast.success(t("timelinePosted"));
    } catch (e) {
      handleError(e);
    } finally {
      setPosting(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteConfirm"),
      description: tc("deleteWarning"),
      details: data
        ? [
            { label: tc("fieldTitle"), value: data.title },
            { label: tc("fieldStatus"), value: t(`type.${data.type}`) },
          ]
        : undefined,
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removeUpdate({ updateId });
      toast.success(t("deleted"));
      router.push("/updates");
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <>
      <UpdateArtBanner seed={data._id} type={data.type} title={data.title} className="mb-8" />
      <div className="px-4 md:px-8">
        <div className="mx-auto max-w-3xl break-words">
          <div className="mb-6 flex items-start justify-between gap-4">
            <Link
              href="/updates"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {t("backToList")}
            </Link>

            {data.isAdmin && (
              <div className="flex shrink-0 items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("emailDeliveryLabel")}
                      className="relative text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="size-4" />
                      {!data.emailRequested && (
                        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-muted-foreground" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Mail className="size-3.5 text-muted-foreground" />
                      {t("emailDeliveryLabel")}
                    </p>
                    {data.emailStats && data.recipients ? (
                      <>
                        <div className="mb-3 flex flex-wrap gap-3">
                          {Object.entries(data.emailStats).map(([status, count]) => (
                            <div key={status} className="text-sm">
                              <span className="font-semibold">{count}</span>{" "}
                              <span className="text-muted-foreground">
                                {t(`emailStatus.${status}`)}
                              </span>
                            </div>
                          ))}
                          {data.recipients.length === 0 && (
                            <p className="text-sm text-muted-foreground">{t("noEmailsSentYet")}</p>
                          )}
                        </div>
                        {data.recipients.length > 0 && (
                          <div className="max-h-72 space-y-1 overflow-y-auto">
                            {data.recipients.map((r) => (
                              <div
                                key={r.userId}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
                              >
                                <Avatar className="size-6">
                                  <AvatarFallback className="text-[10px]">
                                    {initials(r.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                                <Badge variant="muted">{t(`emailStatus.${r.status}`)}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("emailNotSent")}</p>
                    )}
                  </PopoverContent>
                </Popover>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onDelete}
                      aria-label={tc("delete")}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{tc("delete")}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Badge variant={TYPE_BADGE_VARIANT[data.type]}>
              <Icon className="size-3" />
              {t(`type.${data.type}`)}
            </Badge>
            {data.scheduled && <Badge variant="outline">{t("scheduled")}</Badge>}
          </div>

          <h1 className="break-words font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            {data.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("byline", {
              author: data.authorName,
              date: formatDateTime(data.publishedAt, locale),
            })}
          </p>

          {data.type !== "changelog" && (
            <div className="mt-6">
              <StatusCard data={data} t={t} locale={locale} />
            </div>
          )}

          <div className="update-article mt-8 max-w-2xl">
            {data.bodyFormat === "richtext" ? (
              <RichText html={data.body} />
            ) : (
              <UpdateMarkdown>{data.body}</UpdateMarkdown>
            )}
          </div>

          {data.type !== "changelog" && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("timelineLabel")}
              </h2>
              <ol className="space-y-4 border-l border-border pl-4">
                {data.timeline.length === 0 && (
                  <li className="text-sm text-muted-foreground">{t("noTimelineYet")}</li>
                )}
                {data.timeline.map((entry, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.1875rem] top-1 size-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.status && <Badge variant="muted">{t(`status.${entry.status}`)}</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.at, locale)} · {entry.authorName}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{entry.message}</p>
                  </li>
                ))}
              </ol>

              {data.isAdmin && (
                <div className="mt-5 space-y-2 rounded-xl border border-border/70 bg-card p-4">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t("postUpdatePlaceholder")}
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <Select value={nextStatus} onValueChange={setNextStatus}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("noStatusChange")}</SelectItem>
                        {statusesForType(data.type as UpdateType).map((s) => (
                          <SelectItem key={s} value={s}>
                            {t(`status.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={postTimelineEntry}
                      disabled={posting || !message.trim()}
                      className="ml-auto"
                    >
                      {t("postUpdate")}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
