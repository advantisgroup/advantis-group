"use client";

import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";

import { BlogPostComposer } from "@/components/blog/BlogPostComposer";
import { useHasCapability } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function BlogPostDraftPage() {
  const t = useTranslations("Blog");
  const canManage = useHasCapability("manage_blog");
  const { draftId } = useParams<{ draftId: string }>();

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

  return <BlogPostComposer key={draftId} entry={{ draftId }} />;
}
