"use client";

import { useMemo, useRef, useState } from "react";

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
  const updatePage = useMutation(api.guidebookPages.update);
  const addAttachment = useMutation(api.guidebookAttachments.add);
  const oneDriveApi = useOneDriveApi();
  const attachmentUpload = useAttachmentUpload();
  // Set once a submission's create call succeeds; a retry after a failed
  // attachment phase then updates this same page instead of creating a
  // second one under a suffixed slug.
  const createdRef = useRef<{ id: Id<"guidebookPages">; slug: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      const pageFields = {
        title: data.title,
        description: data.description,
        topic: data.topic,
        teams: data.teams,
        minRole: data.minRole ?? undefined,
        blocks: serializeBlocks(data.blocks),
        imageStorageIds: imageStorageIdsOf(data.blocks) as Id<"_storage">[],
      };
      let slug: string;
      if (createdRef.current) {
        // A previous attempt already created this page and only the
        // attachment phase failed — apply any field edits since then instead
        // of creating a second page.
        slug = createdRef.current.slug;
        await updatePage({ pageId: createdRef.current.id, ...pageFields });
      } else {
        slug = uniqueSlug(data.title);
        const { id, slug: createdSlug } = await createPage({ slug, ...pageFields });
        createdRef.current = { id, slug: createdSlug };
        slug = createdSlug;
      }
      if (attachmentUpload.entries.length > 0) {
        attachmentUpload.setUploading(true);
        try {
          await attachPendingFiles(
            slug,
            attachmentUpload.entries.map((e) => e.file),
            oneDriveApi.attachToWiki,
            addAttachment,
            attachmentUpload.setFileProgress,
            attachmentUpload.removeByFile,
          );
        } finally {
          attachmentUpload.setUploading(false);
        }
      }
      toast.success(t("pageCreated"));
      router.push(`/guidebooks/${slug}`);
    } finally {
      setSubmitting(false);
    }
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
        saving={submitting}
        submitLabel={tc("create")}
        attachmentsSlot={
          <PendingWikiAttachments attachmentUpload={attachmentUpload} busy={submitting} />
        }
      />
    </div>
  );
}
