"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { type ReadinessCheck, scoreReadiness } from "@/components/compose/Readiness";
import { useDraft } from "@/components/compose/use-draft";
import { htmlToText } from "@/components/ui/rich-text";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { slugify } from "@/lib/utils";
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
  updatedAt: number;
}

/** Everything the draft keeps. A freshly picked cover file isn't in here —
 *  a File can't be stored — only a cover that's already uploaded is. */
interface BlogPostValues {
  title: string;
  slug: string;
  slugEdited: boolean;
  language: "de" | "en";
  translationKey: string;
  excerpt: string;
  category: string;
  body: string;
  coverStorageId: string | null;
  coverUrl: string | null;
  published: boolean;
}

/** A post being written for the first time is addressed by its draft instead. */
export type BlogPostSubject = BlogPostEntry | { draftId: string };

function initialValues(entry: BlogPostSubject): BlogPostValues {
  if ("draftId" in entry) {
    return {
      title: "",
      slug: "",
      slugEdited: false,
      language: "de",
      translationKey: "",
      excerpt: "",
      category: "",
      body: "",
      coverStorageId: null,
      coverUrl: null,
      published: false,
    };
  }
  return {
    title: entry.title,
    slug: entry.slug,
    slugEdited: true,
    language: entry.language,
    translationKey: entry.translationKey ?? "",
    excerpt: entry.excerpt,
    category: entry.category ?? "",
    body: entry.body,
    coverStorageId: entry.mainImageStorageId ?? null,
    coverUrl: entry.mainImageUrl ?? null,
    published: entry.status === "published",
  };
}

/**
 * State, draft, readiness and submit for the blog composer. The draft is per
 * post (its own draft id for a fresh one): restored silently for a new post,
 * offered as a question when editing one that's already saved.
 */
export function useBlogPostForm({
  entry,
  onDone,
}: {
  entry: BlogPostSubject;
  onDone: (id: Id<"blogPosts">) => void;
}) {
  const t = useTranslations("Blog");
  const handleError = useErrorHandler();
  const isEditing = !("draftId" in entry);

  const create = useMutation(api.blog.posts.create);
  const update = useMutation(api.blog.posts.update);
  const publishMutation = useMutation(api.blog.posts.publish);
  const unpublishMutation = useMutation(api.blog.posts.unpublish);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [values, setValues] = useState<BlogPostValues>(() => initialValues(entry));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverBlobUrl, setCoverBlobUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [busy, setBusy] = useState(false);

  const setters = useMemo(() => {
    const field =
      <K extends keyof BlogPostValues>(key: K) =>
      (value: BlogPostValues[K]) =>
        setValues((prev) => ({ ...prev, [key]: value }));
    return {
      setTitle: (title: string) =>
        setValues((prev) => ({
          ...prev,
          title,
          slug: prev.slugEdited ? prev.slug : slugify(title),
        })),
      setSlug: (slug: string) => setValues((prev) => ({ ...prev, slug, slugEdited: true })),
      setLanguage: field("language"),
      setTranslationKey: field("translationKey"),
      setExcerpt: field("excerpt"),
      setCategory: field("category"),
      setBody: field("body"),
      setPublished: field("published"),
    };
  }, []);

  const draft = useDraft<BlogPostValues>({
    surface: "blogPost",
    subjectKey: isEditing ? entry._id : entry.draftId,
    value: values,
    restore: isEditing ? "offer" : "auto",
    entitySavedAt: isEditing ? entry.updatedAt : undefined,
    isEmpty: (v) =>
      !isEditing &&
      !v.title.trim() &&
      !v.excerpt.trim() &&
      !htmlToText(v.body).trim() &&
      !v.coverStorageId,
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  function pickCoverFile(file: File) {
    setCoverFile(file);
    setCoverBlobUrl(URL.createObjectURL(file));
    setValues((prev) => ({ ...prev, coverStorageId: null, coverUrl: null }));
  }

  function removeCover() {
    setCoverFile(null);
    setCoverBlobUrl(null);
    setValues((prev) => ({ ...prev, coverStorageId: null, coverUrl: null }));
  }

  function discardChanges() {
    const fresh = initialValues(entry);
    setValues(fresh);
    setCoverFile(null);
    setCoverBlobUrl(null);
    void draft.clear(fresh);
  }

  const checks: ReadinessCheck[] = [
    { key: "title", label: t("fieldTitle"), done: !!values.title.trim() },
    { key: "body", label: t("fieldBody"), done: htmlToText(values.body).trim().length > 0 },
    { key: "excerpt", label: t("fieldExcerpt"), done: !!values.excerpt.trim() },
    { key: "slug", label: t("fieldSlug"), done: !!values.slug.trim() },
    {
      key: "cover",
      label: t("fieldCoverImage"),
      done: !!coverFile || !!values.coverStorageId,
      optional: true,
    },
    { key: "category", label: t("fieldCategory"), done: !!values.category, optional: true },
  ];
  const readiness = scoreReadiness(checks);

  async function submit() {
    if (!readiness.canSubmit) {
      toast.error(t("formIncomplete"));
      return;
    }
    setBusy(true);
    try {
      let mainImageStorageId = (values.coverStorageId ?? undefined) as Id<"_storage"> | undefined;
      if (coverFile) {
        setUploadingCover(true);
        mainImageStorageId = await uploadToConvex(() => generateUploadUrl({}), coverFile);
        setUploadingCover(false);
      }
      const patch = {
        slug: values.slug.trim(),
        language: values.language,
        translationKey: values.translationKey.trim() || undefined,
        title: values.title.trim(),
        excerpt: values.excerpt.trim(),
        category: values.category || undefined,
        body: values.body,
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

      if (values.published) {
        await publishMutation({ postId });
      } else if (isEditing && entry.status === "published") {
        await unpublishMutation({ postId });
      }

      await draft.clear();
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
    ...values,
    ...setters,
    coverPreviewUrl: coverBlobUrl ?? values.coverUrl,
    pickCoverFile,
    removeCover,
    uploadingCover,
    isEditing,
    submit,
    busy,
    draft,
    checks,
    readiness,
    discardChanges,
  };
}

export type UseBlogPostForm = ReturnType<typeof useBlogPostForm>;
