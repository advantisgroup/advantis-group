"use client";

import { api } from "@advantis/convex/api";
import { useConvex, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { isStorageImageSrc } from "@/components/ui/rich-text";
import { isImage, MAX_ATTACHMENT_BYTES, uploadToConvex } from "@/lib/upload";

/**
 * Upload handler for the rich-text toolbar's "insert image" button
 * (`RichTextToolbar`'s `onUploadImage`): pushes the picked image into Convex
 * storage and resolves with its storage URL — the only kind of uploaded
 * image `sanitizeHtml` keeps in a text. Resolves `null` (after a toast) when
 * the file isn't an image, is too large, or the upload fails.
 */
export function useRichImageUpload() {
  const t = useTranslations("Guidebooks");
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  return useCallback(
    async (file: File): Promise<string | null> => {
      if (!isImage(file)) {
        toast.error(t("uploadFailed"));
        return null;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(t("attachTooLarge"));
        return null;
      }
      try {
        const storageId = await uploadToConvex(() => generateUploadUrl({}), file);
        const url = await convex.query(api.files.getUrl, { storageId });
        if (!isStorageImageSrc(url)) throw new Error("Unexpected storage URL");
        return url;
      } catch {
        toast.error(t("uploadFailed"));
        return null;
      }
    },
    [convex, generateUploadUrl, t],
  );
}
