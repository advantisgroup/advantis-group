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
import { useWikiEntryForm } from "@/components/guidebooks/useWikiEntryForm";
import { PendingWikiAttachments } from "@/components/guidebooks/PendingWikiAttachments";
import { staticGuidebookSlugs } from "@/components/guidebooks/registry";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { imageStorageIdsOf, serializeBlocks, slugify } from "@/lib/guidebook-blocks";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { WIKI_FOLDER_BASE } from "@/lib/onedrive-scopes";
import { attachPendingFiles } from "@/lib/wiki-attachments";
import { cn } from "@/lib/utils";

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
  const [mode, setMode] = useState<"entry" | "advanced">("entry");
  const entryForm = useWikiEntryForm({
    entry: "new",
    onDone: () => router.push("/guidebooks"),
  });

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
          toast.success(t("uploadedTo", { path: `${WIKI_FOLDER_BASE}/${slug}` }));
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
      <PageHeaderBar
        title={mode === "entry" ? t("createEntry") : t("createPage")}
        description={mode === "entry" ? t("createEntryHint") : t("createPageHint")}
      />

      {/* Both formats create a wiki page; which one you want depends on the
          content, not on which menu item you happened to click. Switching
          here keeps that a single decision inside one composer. */}
      <div
        role="tablist"
        aria-label={t("composerModeLabel")}
        className="mb-5 inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {(["entry", "advanced"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "entry" ? t("composerModeEntry") : t("composerModeAdvanced")}
          </button>
        ))}
      </div>

      {mode === "entry" ? (
        <div className="space-y-5">
          {entryForm.fields}
          <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
            <Button variant="ghost" onClick={() => router.push("/guidebooks")}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void entryForm.submit()} disabled={entryForm.busy}>
              {tc("create")}
            </Button>
          </div>
        </div>
      ) : (
        <GuidebookEditor
          onSave={handleSave}
          saving={submitting}
          submitLabel={tc("create")}
          attachmentsSlot={
            <PendingWikiAttachments attachmentUpload={attachmentUpload} busy={submitting} />
          }
        />
      )}
    </div>
  );
}
