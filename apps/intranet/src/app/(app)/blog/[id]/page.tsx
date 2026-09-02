"use client";

import { use } from "react";

import { notFound } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { BlogPostInfo } from "@/components/blog/BlogPostInfo";
import { useHasCapability } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BlogPostInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("Blog");
  const canManage = useHasCapability("manage_blog");
  const post = useQuery(api.blogPosts.get, canManage ? { postId: id as Id<"blogPosts"> } : "skip");

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
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (post === null) notFound();

  return <BlogPostInfo post={post} />;
}
