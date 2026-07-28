"use client";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { GuidebookEditor, type GuidebookFormData } from "@/components/guidebooks/GuidebookEditor";
import { type GuidebookTopic } from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { imageStorageIdsOf, parseBlocks, serializeBlocks } from "@/lib/guidebook-blocks";

export default function EditGuidebookPage() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const user = useCurrentUser();
  const page = useQuery(api.guidebookPages.get, { slug: params.slug });
  const updatePage = useMutation(api.guidebookPages.update);

  const canEdit = !!page && (page.authorUserId === user._id || user.role === "admin");

  async function handleSave(data: GuidebookFormData) {
    if (!page) return;
    await updatePage({
      pageId: page._id,
      title: data.title,
      description: data.description,
      topic: data.topic,
      teams: data.teams,
      minRole: data.minRole ?? undefined,
      blocks: serializeBlocks(data.blocks),
      imageStorageIds: imageStorageIdsOf(data.blocks) as Id<"_storage">[],
    });
    toast.success(t("pageUpdated"));
    router.push(`/guidebooks/${page.slug}`);
  }

  if (page === undefined) return null;

  if (!page || !canEdit) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("noAccess")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/guidebooks/${page.slug}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {page.title}
      </Link>
      <PageHeader eyebrow={t("eyebrow")} title={t("editPage")} />
      <GuidebookEditor
        initial={{
          title: page.title,
          description: page.description,
          topic: page.topic as GuidebookTopic,
          teams: page.teams,
          minRole: page.minRole,
          blocks: parseBlocks(page.blocks),
        }}
        onSave={handleSave}
        saving={false}
        submitLabel={tc("save")}
      />
    </div>
  );
}
