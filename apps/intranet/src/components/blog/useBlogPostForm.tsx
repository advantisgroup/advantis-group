"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useErrorHandler } from "@/hooks/use-error-handler";
import { slugify } from "@/lib/guidebook-blocks";
import { uploadToConvex } from "@/lib/upload";

/** Mirrors `BLOG_CATEGORIES` in apps/marketing's `lib/blog-categories.ts` —
 *  the marketing site owns the labels and styling, this side only needs the
 *  slugs to write. Keep the two lists in sync when adding a category. */
export const BLOG_CATEGORIES = ["unternehmen", "vertrieb", "ki", "karriere", "events"] as const;

// Mirrors EXCERPT_MAX_LENGTH in packages/convex/convex/blogPosts.ts.
export const EXCERPT_MAX_LENGTH = 200;

export interface BlogPostEntry {
  _id: Id<"blogPosts">;
  slug: string;
  language: "de" | "en";
  translationKey?: string;
  title: string;
  excerpt: string;
  category?: string;
  body: string;
  mainImageStorageId?: Id<"_storage">;
  mainImageUrl?: string;
  status: "draft" | "published";
}

/**
 * State, validation and submit for the blog composer — mirrors
 * useWikiEntryForm's shape (state + submit() + ready-to-place field slots)
 * but with blog fields instead of wiki fields. The cover image uses a
 * single-file uploadToConvex call directly rather than the multi-file
 * useAttachmentUpload hook, since there's only ever one cover image, not a
 * batch of attachments.
 */
export function useBlogPostForm({
  entry,
  onDone,
}: {
  entry: BlogPostEntry | "new";
  onDone: (id: Id<"blogPosts">) => void;
}) {
  const t = useTranslations("Blog");
  const handleError = useErrorHandler();
  const isEditing = entry !== "new";

  const create = useMutation(api.blogPosts.create);
  const update = useMutation(api.blogPosts.update);
  const publishMutation = useMutation(api.blogPosts.publish);
  const unpublishMutation = useMutation(api.blogPosts.unpublish);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [title, setTitleRaw] = useState(isEditing ? entry.title : "");
  const [slug, setSlugRaw] = useState(isEditing ? entry.slug : "");
  const [slugEdited, setSlugEdited] = useState(isEditing);
  const [language, setLanguage] = useState<"de" | "en">(isEditing ? entry.language : "de");
  const [translationKey, setTranslationKey] = useState(
    isEditing ? (entry.translationKey ?? "") : "",
  );
  const [excerpt, setExcerpt] = useState(isEditing ? entry.excerpt : "");
  const [category, setCategory] = useState(isEditing ? (entry.category ?? "") : "");
  const [body, setBody] = useState(isEditing ? entry.body : "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    isEditing ? (entry.mainImageUrl ?? null) : null,
  );
  const [coverStorageId, setCoverStorageId] = useState<Id<"_storage"> | null>(
    isEditing ? (entry.mainImageStorageId ?? null) : null,
  );
  const [uploadingCover, setUploadingCover] = useState(false);
  const [published, setPublished] = useState(isEditing ? entry.status === "published" : false);
  const [busy, setBusy] = useState(false);

  function setTitle(value: string) {
    setTitleRaw(value);
    if (!slugEdited) setSlugRaw(slugify(value));
  }

  function setSlug(value: string) {
    setSlugEdited(true);
    setSlugRaw(value);
  }

  function pickCoverFile(file: File) {
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
    setCoverStorageId(null);
  }

  function removeCover() {
    setCoverFile(null);
    setCoverPreviewUrl(null);
    setCoverStorageId(null);
  }

  async function submit() {
    if (!title.trim() || !slug.trim() || !excerpt.trim()) {
      toast.error(t("formIncomplete"));
      return;
    }
    setBusy(true);
    try {
      let mainImageStorageId = coverStorageId ?? undefined;
      if (coverFile) {
        setUploadingCover(true);
        mainImageStorageId = await uploadToConvex(() => generateUploadUrl({}), coverFile);
        setUploadingCover(false);
      }
      const patch = {
        slug: slug.trim(),
        language,
        translationKey: translationKey.trim() || undefined,
        title: title.trim(),
        excerpt: excerpt.trim(),
        category: category || undefined,
        body,
        mainImageStorageId,
      };

      let postId: Id<"blogPosts">;
      if (isEditing) {
        await update({ postId: entry._id, ...patch });
        postId = entry._id;
      } else {
        const created = await create(patch);
        postId = created.id;
      }

      if (published) {
        await publishMutation({ postId });
      } else if (isEditing && entry.status === "published") {
        await unpublishMutation({ postId });
      }

      toast.success(isEditing ? t("postUpdated") : t("postCreated"));
      onDone(postId);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
      setUploadingCover(false);
    }
  }

  return {
    title,
    setTitle,
    slug,
    setSlug,
    language,
    setLanguage,
    translationKey,
    setTranslationKey,
    excerpt,
    setExcerpt,
    category,
    setCategory,
    body,
    setBody,
    coverPreviewUrl,
    pickCoverFile,
    removeCover,
    uploadingCover,
    published,
    setPublished,
    isEditing,
    submit,
    busy,
  };
}

export type UseBlogPostForm = ReturnType<typeof useBlogPostForm>;
