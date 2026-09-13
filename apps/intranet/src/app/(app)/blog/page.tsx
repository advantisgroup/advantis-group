"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Ellipsis, ExternalLink, Newspaper, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountTabs } from "@/components/ui/count-tabs";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Post = NonNullable<ReturnType<typeof useQuery<typeof api.blogPosts.list>>>[number];
type Tab = "all" | "published" | "draft";

function PostStatus({ published }: { published: boolean }) {
  const t = useTranslations("Blog");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        !published && "text-muted-foreground",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: published ? "var(--ok)" : "var(--muted-foreground)" }}
      />
      {published ? t("statusPublished") : t("statusDraft")}
    </span>
  );
}

function RefreshedBlogList({
  posts,
  onDelete,
}: {
  posts: Post[] | undefined;
  onDelete: (post: Post) => void;
}) {
  const t = useTranslations("Blog");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const searched = (posts ?? []).filter(
    (post) => !query || (post.title || t("untitled")).toLowerCase().includes(query),
  );
  const inTab = (post: Post, value: Tab) =>
    value === "all" || (value === "published") === (post.status === "published");
  const rows = searched.filter((post) => inTab(post, tab));

  function menu(post: Post) {
    return (
      <ActionMenu
        ariaLabel={t("moreActions")}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("moreActions")}
            onClick={(event) => event.stopPropagation()}
          >
            <Ellipsis />
          </Button>
        }
        items={[
          {
            key: "open",
            label: tc("open"),
            icon: <ExternalLink />,
            onSelect: () => router.push(`/blog/${post._id}`),
          },
          {
            key: "edit",
            label: t("editPost"),
            icon: <Pencil />,
            onSelect: () => router.push(`/blog/${post._id}/edit`),
          },
          { key: "sep", separator: true },
          {
            key: "delete",
            label: t("delete"),
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => onDelete(post),
          },
        ]}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<Newspaper />} />
      <PageHeaderActions
        actions={[
          {
            key: "new-post",
            label: t("newPost"),
            icon: Plus,
            onClick: () => router.push("/blog/new"),
          },
        ]}
      />

      <CountTabs
        value={tab}
        onChange={setTab}
        tabs={(["all", "published", "draft"] as const).map((value) => ({
          value,
          label:
            value === "all"
              ? tc("all")
              : value === "published"
                ? t("statusPublished")
                : t("statusDraft"),
          count: searched.filter((post) => inTab(post, value)).length,
        }))}
      />

      <div className="py-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
          />
        </div>
      </div>

      {posts === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Newspaper />}
          title={posts.length === 0 ? t("noPostsYet") : t("noResults")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("fieldTitle")}</TableHead>
                <TableHead className="w-32">{t("fieldPublished")}</TableHead>
                <TableHead className="w-24">{t("fieldLanguage")}</TableHead>
                <TableHead className="w-44">{t("fieldUpdated")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((post) => (
                <TableRow
                  key={post._id}
                  tabIndex={0}
                  onClick={() => router.push(`/blog/${post._id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(`/blog/${post._id}`);
                  }}
                  className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <TableCell className="w-full max-w-0">
                    <span className={cn("block truncate font-medium", !post.title && "italic")}>
                      {post.title || t("untitled")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PostStatus published={post.status === "published"} />
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase">
                      {post.language}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(post.updatedAt, locale)}
                  </TableCell>
                  <TableCell className="text-right">{menu(post)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul className="divide-y divide-border/60 md:hidden">
            {rows.map((post) => (
              <li key={post._id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/blog/${post._id}`} className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-medium">
                    {post.title || t("untitled")}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <PostStatus published={post.status === "published"} />
                    <span className="font-mono uppercase">{post.language}</span>
                    <span className="truncate">{formatDateTime(post.updatedAt, locale)}</span>
                  </span>
                </Link>
                {menu(post)}
              </li>
            ))}
          </ul>

          <div className="border-t border-border/70 px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
            {t("countLabel", { shown: rows.length, total: posts.length })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BlogListPage() {
  const t = useTranslations("Blog");
  const canManage = useHasCapability("manage_blog");
  const posts = useQuery(api.blogPosts.list, canManage ? {} : "skip");
  const remove = useMutation(api.blogPosts.remove);
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  if (!canManage) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("noAccess")}
          </CardContent>
        </Card>
      </div>
    );
  }

  async function onDelete(id: Id<"blogPosts">, title: string) {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDescription", { title }),
      destructive: true,
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await remove({ postId: id });
    } catch (e) {
      handleError(e);
    }
  }

  const deletePost = (post: Post) => void onDelete(post._id, post.title || t("untitled"));

  return <RefreshedBlogList posts={posts} onDelete={deletePost} />;
}
