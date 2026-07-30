"use client";

import { useMemo } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { GuidebookEditor, type GuidebookFormData } from "@/components/guidebooks/GuidebookEditor";
import { PendingWikiAttachments } from "@/components/guidebooks/PendingWikiAttachments";
import { staticGuidebookSlugs } from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { imageStorageIdsOf, serializeBlocks, slugify } from "@/lib/guidebook-blocks";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { attachPendingFiles } from "@/lib/wiki-attachments";

export default function NewGuidebookPage() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const router = useRouter();
  const isManager = useIsManager();
  const customPages = useQuery(api.guidebookPages.list);
  const createPage = useMutation(api.guidebookPages.create);
  const addAttachment = useMutation(api.guidebookAttachments.add);
  const oneDriveApi = useOneDriveApi();
  const attachmentUpload = useAttachmentUpload();

  const takenSlugs = useMemo(
    () => new Set([...staticGuidebookSlugs(), ...(customPages ?? []).map((p) => p.slug)]),
    [customPages],
  );

  function uniqueSlug(title: string): string {
    const base = slugify(title);
    if (!takenSlugs.has(base)) return base;
    let i = 2;
    while (takenSlugs.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }

  async function handleSave(data: GuidebookFormData) {
    const slug = uniqueSlug(data.title);
    const { slug: createdSlug } = await createPage({
      slug,
      title: data.title,
      description: data.description,
      topic: data.topic,
      teams: data.teams,
      minRole: data.minRole ?? undefined,
      blocks: serializeBlocks(data.blocks),
      imageStorageIds: imageStorageIdsOf(data.blocks) as Id<"_storage">[],
    });
    if (attachmentUpload.entries.length > 0) {
      attachmentUpload.setUploading(true);
      try {
        await attachPendingFiles(
          createdSlug,
          attachmentUpload.entries.map((e) => e.file),
          oneDriveApi.attachToWiki,
          addAttachment,
          attachmentUpload.setFileProgress,
        );
      } finally {
        attachmentUpload.setUploading(false);
      }
    }
    toast.success(t("pageCreated"));
    router.push(`/guidebooks/${createdSlug}`);
  }

  if (!isManager) {
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
        href="/guidebooks"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <PageHeader eyebrow={t("eyebrow")} title={t("createPage")} />
      <GuidebookEditor
        onSave={handleSave}
        saving={false}
        submitLabel={tc("create")}
        attachmentsSlot={<PendingWikiAttachments attachmentUpload={attachmentUpload} />}
      />
    </div>
  );
}
