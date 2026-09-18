"use client";

import { use } from "react";

import { notFound } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { BlogPostComposer } from "@/components/blog/BlogPostComposer";
import { useHasCapability } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("Blog");
  const canManage = useHasCapability("manage_blog");
  const post = useQuery(api.blog.posts.get, canManage ? { postId: id as Id<"blogPosts"> } : "skip");

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

  if (post === undefined) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (post === null) notFound();

  return (
    <BlogPostComposer
      entry={{
        _id: post._id,
        slug: post.slug,
        language: post.language,
        translationKey: post.translationKey,
        title: post.title,
        excerpt: post.excerpt,
        category: post.category,
        body: post.body,
        mainImageStorageId: post.mainImageStorageId,
        mainImageUrl: post.mainImageUrl,
        status: post.status,
        updatedAt: post.updatedAt,
      }}
    />
  );
}
