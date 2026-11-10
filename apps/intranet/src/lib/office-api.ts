"use client";

import { useMemo } from "react";

import { type Doc } from "@advantis/convex/dataModel";

import { useIntranetApiClient } from "@/lib/api-client";
import { shrinkPhoto } from "@/lib/image";

/** One suggestion from `POST /office/recognize` (apps/api routes/office.ts). */
export interface RecognizedItem {
  kind: Doc<"officeItems">["kind"];
  name: string;
  spec: string;
  serialNumber: string;
  inventoryNumber: string;
  quantity: number;
  defective: boolean;
  unsure: boolean;
  note: string;
}

export function useOfficeApi() {
  const api = useIntranetApiClient();
  return useMemo(
    () => ({
      /** Photos and/or a dictated description in, equipment suggestions out.
       *  Nothing is saved; photos are not stored. */
      async recognize(photos: File[], text: string, place: string) {
        const form = new FormData();
        for (const photo of photos) {
          form.append("files", await shrinkPhoto(photo), "photo.jpg");
        }
        if (text.trim()) form.append("text", text.trim());
        form.append("place", place);
        return api.uploadForm<{ items: RecognizedItem[] }>("/office/recognize", form);
      },
    }),
    [api],
  );
}
