"use client";

import { api } from "@advantis/convex/api";
import { type Doc } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Download, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { MetricRow, Panel, PanelSkeleton, StatTile } from "@/components/admin/overview/primitives";
import { Link } from "@/components/Link";
import { useBlogPostAnalytics } from "@/components/blog/useBlogPostAnalytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export function BlogPostInfo({ post }: { post: Doc<"blogPosts"> }) {
  const t = useTranslations("Blog");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const publishMutation = useMutation(api.blogPosts.publish);
  const unpublishMutation = useMutation(api.blogPosts.unpublish);
  const removeMutation = useMutation(api.blogPosts.remove);

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
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {post.title || t("untitled")}
            </h1>
            <Badge variant={isPublished ? "default" : "muted"}>
              {isPublished ? t("statusPublished") : t("statusDraft")}
            </Badge>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label={t("statViews")} value={analytics.views} />
              <StatTile label={t("statUniqueVisitors")} value={analytics.uniqueVisitors} />
              <StatTile
                label={t("statAvgTime")}
                value={formatSeconds(analytics.avgTimeOnPageSeconds)}
              />
              <StatTile label={t("statBounceRate")} value={formatPercent(analytics.bounceRate)} />
            </div>
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

      <Panel title={t("settingsTitle")}>
        <div>
          <DetailRow label={t("fieldSlug")} value={post.slug} />
          <DetailRow
            label={t("fieldLanguage")}
            value={post.language === "de" ? t("languageDe") : t("languageEn")}
          />
          <DetailRow
            label={t("fieldCategory")}
            value={post.category ? t(`categories.${post.category}`) : t("fieldCategoryNone")}
          />
          {post.translationKey && (
            <DetailRow label={t("fieldTranslationKey")} value={post.translationKey} />
          )}
          <DetailRow label={t("fieldAuthor")} value={post.authorName} />
          <DetailRow label={t("fieldCreated")} value={formatDateTime(post.createdAt, locale)} />
          <DetailRow label={t("fieldUpdated")} value={formatDateTime(post.updatedAt, locale)} />
          {post.publishedAt && (
            <DetailRow
              label={t("fieldPublishedAt")}
              value={formatDateTime(post.publishedAt, locale)}
            />
          )}
          {post.readingMinutes && (
            <DetailRow
              label={t("fieldReadingTime")}
              value={t("readingTimeValue", { minutes: post.readingMinutes })}
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
