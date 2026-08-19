"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

export default function BlogListPage() {
  const t = useTranslations("Blog");
  const locale = useLocale();
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/blog/new">
            <Plus className="mr-1.5 size-4" />
            {t("newPost")}
          </Link>
        </Button>
      </div>

      {posts === undefined ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("noPostsYet")}
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {posts.map((post) => (
            <div key={post._id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/blog/${post._id}/edit`}
                  className="truncate font-medium hover:underline"
                >
                  {post.title || t("untitled")}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {post.language.toUpperCase()} · {formatDateTime(post.updatedAt, locale)}
                </p>
              </div>
              <Badge variant={post.status === "published" ? "default" : "muted"}>
                {post.status === "published" ? t("statusPublished") : t("statusDraft")}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("delete")}
                onClick={() => void onDelete(post._id, post.title || t("untitled"))}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
