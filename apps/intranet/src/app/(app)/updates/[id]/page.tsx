"use client";

import { useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Mail,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import type { FunctionReturnType } from "convex/server";

import { Link } from "@/components/Link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { RichText } from "@/components/ui/rich-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, initials } from "@/lib/format";
import { formatDuration, statusesForType, type UpdateType } from "@/lib/updates";

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

type UpdateDetail = FunctionReturnType<typeof api.updates.get>;

function StatusCard({
  data,
  t,
  locale,
}: {
  data: UpdateDetail;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const now = Date.now();
  const durationMs = (data.resolvedAt ?? now) - data.startedAt;
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
          <p className="mt-1 text-sm">{formatDateTime(data.startedAt, locale)}</p>
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
              {data.affectedSystems.map(s => (
                <Badge key={s} variant="outline">
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

  const data = useQuery(api.updates.get, { updateId });
  const addTimeline = useMutation(api.updates.addTimelineEntry);
  const removeUpdate = useMutation(api.updates.remove);

  const [message, setMessage] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("none");
  const [posting, setPosting] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted/50" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/50" />
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
    <div className="mx-auto max-w-3xl">
      <Link
        href="/updates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("backToList")}
      </Link>

      <div className="mb-3 flex items-center gap-2">
        <Badge variant={TYPE_BADGE_VARIANT[data.type]}>
          <Icon className="size-3" />
          {t(`type.${data.type}`)}
        </Badge>
        {data.scheduled && <Badge variant="outline">{t("scheduled")}</Badge>}
      </div>

      <h1 className="font-display text-3xl font-bold tracking-tight">
        {data.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("byline", {
          author: data.authorName,
          date: formatDateTime(data.publishedAt, locale),
        })}
      </p>

      {data.isAdmin && (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            {tc("delete")}
          </Button>
        </div>
      )}

      {data.type !== "changelog" && (
        <div className="mt-6">
          <StatusCard data={data} t={t} locale={locale} />
        </div>
      )}

      <div className="mt-6 prose prose-sm max-w-none dark:prose-invert">
        {data.bodyFormat === "richtext" ? (
          <RichText html={data.body} />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.body}</ReactMarkdown>
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
                  {entry.status && (
                    <Badge variant="muted">{t(`status.${entry.status}`)}</Badge>
                  )}
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
                onChange={e => setMessage(e.target.value)}
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
                    {statusesForType(data.type as UpdateType).map(s => (
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

      {data.isAdmin && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowRecipients(v => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Mail className="size-4 text-muted-foreground" />
              {t("emailDeliveryLabel")}
              {!data.emailRequested && (
                <span className="text-xs text-muted-foreground">
                  ({t("emailNotSent")})
                </span>
              )}
            </span>
            {showRecipients ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>

          {showRecipients && data.emailStats && data.recipients && (
            <div className="mt-2 rounded-xl border border-border/70 bg-card p-4">
              <div className="mb-4 flex flex-wrap gap-4">
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
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {data.recipients.map(r => (
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
            </div>
          )}
        </section>
      )}
    </div>
  );
}
