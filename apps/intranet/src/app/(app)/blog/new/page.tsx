"use client";

import { useTranslations } from "next-intl";

import { BlogPostComposer } from "@/components/blog/BlogPostComposer";
import { useHasCapability } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function NewBlogPostPage() {
  const t = useTranslations("Blog");
  const canManage = useHasCapability("manage_blog");

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

  return <BlogPostComposer entry="new" />;
}
