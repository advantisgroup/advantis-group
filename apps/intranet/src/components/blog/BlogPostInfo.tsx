"use client";

import { api } from "@advantis/convex/api";
import { type Doc } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Download, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { MetricRow, Panel, PanelSkeleton } from "@/components/admin/overview/primitives";
import { Link } from "@/components/Link";
import { useBlogPostAnalytics } from "@/components/blog/useBlogPostAnalytics";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { exportBlogPostAsHtml, exportBlogPostAsMarkdown } from "@/lib/blog-export";
import { formatDateTime } from "@/lib/format";

const SITE_ORIGIN = "https://advantisgroup.de";

function publicUrlFor(post: Pick<Doc<"blogPosts">, "language" | "slug">): string {
  return `${SITE_ORIGIN}/${post.language}/blog/${post.slug}`;
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const rounded = Math.round(seconds);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatPercent(fraction: number | null): string {
  if (fraction === null) return "—";
  return `${Math.round(fraction * 100)}%`;
}

export function BlogPostInfo({ post }: { post: Doc<"blogPosts"> }) {
  const t = useTranslations("Blog");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const publishMutation = useMutation(api.blog.posts.publish);
  const unpublishMutation = useMutation(api.blog.posts.unpublish);
  const removeMutation = useMutation(api.blog.posts.remove);

  const {
    data: analytics,
    loading: analyticsLoading,
    error: analyticsError,
  } = useBlogPostAnalytics(post._id);

  const isPublished = post.status === "published";
  const publicUrl = publicUrlFor(post);

  async function togglePublished() {
    try {
      if (isPublished) {
        const ok = await confirm({
          title: t("unpublishConfirmTitle"),
          description: t("unpublishConfirmDescription", { title: post.title || t("untitled") }),
          confirmLabel: t("unpublish"),
        });
        if (!ok) return;
        await unpublishMutation({ postId: post._id });
        toast.success(t("postUnpublished"));
      } else {
        await publishMutation({ postId: post._id });
        toast.success(t("postPublished"));
      }
    } catch (e) {
      handleError(e);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDescription", { title: post.title || t("untitled") }),
      destructive: true,
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await removeMutation({ postId: post._id });
      toast.success(t("delete"));
    } catch (e) {
      handleError(e);
    }
  }

  const exportable = {
    title: post.title || t("untitled"),
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.body,
    authorName: post.authorName,
    language: post.language,
    publishedAt: post.publishedAt,
  };

  const details = [
    { label: t("fieldSlug"), value: post.slug },
    {
      label: t("fieldLanguage"),
      value: post.language === "de" ? t("languageDe") : t("languageEn"),
    },
    {
      label: t("fieldCategory"),
      value: post.category ? t(`categories.${post.category}`) : t("fieldCategoryNone"),
    },
    ...(post.translationKey
      ? [{ label: t("fieldTranslationKey"), value: post.translationKey }]
      : []),
    { label: t("fieldAuthor"), value: post.authorName },
    { label: t("fieldCreated"), value: formatDateTime(post.createdAt, locale) },
    { label: t("fieldUpdated"), value: formatDateTime(post.updatedAt, locale) },
    ...(post.publishedAt
      ? [{ label: t("fieldPublishedAt"), value: formatDateTime(post.publishedAt, locale) }]
      : []),
    ...(post.readingMinutes
      ? [
          {
            label: t("fieldReadingTime"),
            value: t("readingTimeValue", { minutes: post.readingMinutes }),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <Link
            href="/blog"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {tc("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display tracking-tight text-xl font-semibold">
              {post.title || t("untitled")}
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <span
                className="size-2 rounded-full"
                style={{ background: isPublished ? "var(--ok)" : "var(--muted-foreground)" }}
              />
              {isPublished ? t("statusPublished") : t("statusDraft")}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isPublished && (
            <Button variant="ghost" size="sm" asChild>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 size-3.5" />
                {t("viewLive")}
              </a>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link href={`/blog/${post._id}/edit`}>{tc("edit")}</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("moreActions")}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Download className="size-4" />
                  {t("download")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => void exportBlogPostAsMarkdown(exportable)}>
                    {t("downloadMarkdown")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportBlogPostAsHtml(exportable)}>
                    {t("downloadHtml")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={() => void togglePublished()}>
                {isPublished ? t("unpublish") : t("publish")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void onDelete()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Panel title={t("analyticsTitle")} description={t("analyticsSubtitle")}>
        {!isPublished ? (
          <p className="text-sm text-muted-foreground">{t("notPublishedYet")}</p>
        ) : analyticsLoading ? (
          <PanelSkeleton rows={2} />
        ) : analyticsError ? (
          <p className="text-sm text-muted-foreground">{t("analyticsError")}</p>
        ) : !analytics?.configured ? (
          <p className="text-sm text-muted-foreground">{t("postHogNotConfigured")}</p>
        ) : (
          <div className="space-y-5">
            <KpiStrip>
              <Kpi featured label={t("statViews")} value={analytics.views} />
              <Kpi label={t("statUniqueVisitors")} value={analytics.uniqueVisitors} />
              <Kpi label={t("statAvgTime")} value={formatSeconds(analytics.avgTimeOnPageSeconds)} />
              <Kpi label={t("statBounceRate")} value={formatPercent(analytics.bounceRate)} />
            </KpiStrip>
            {analytics.views === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noVisitsYet")}</p>
            ) : (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("referrersTitle")}
                </p>
                {analytics.referrers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noReferrers")}</p>
                ) : (
                  <div className="space-y-0.5">
                    {analytics.referrers.map((r) => (
                      <MetricRow key={r.domain} label={r.domain} value={r.visitors} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>

      <SettingsSection title={t("settingsTitle")}>
        {details.map((detail) => (
          <SettingsRow
            key={detail.label}
            title={detail.label}
            control={
              <span className="block max-w-64 truncate text-sm text-muted-foreground">
                {detail.value}
              </span>
            }
          />
        ))}
      </SettingsSection>
    </div>
  );
}
