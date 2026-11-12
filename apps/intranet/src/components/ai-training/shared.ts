"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";

import { useIntranetApiClient } from "@/lib/api-client";
import { detectImportExt, importFile } from "@/lib/wiki-import";

export interface TrainingFile {
  storageId: string;
  name: string;
}

export const TRAINING_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.html,.docx";
/** apps/api's caps: 8 MB per file, 3.5 MB per image. */
export const MAX_TRAINING_FILE_BYTES = 8 * 1024 * 1024;

export function useAiTrainingApi() {
  const client = useIntranetApiClient();
  const generateUploadUrl = useMutation(api.aiTraining.sessions.generateUploadUrl);
  return useMemo(
    () => ({
      send: (sessionId: Id<"aiTrainingSessions">, message: string, files: TrainingFile[]) =>
        client.fetchJson<{ runId: Id<"aiRuns"> }>(`/ai-training/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, files }),
        }),
      check: () =>
        client.fetchJson<{ runId: Id<"aiRuns"> }>("/ai-training/check", { method: "POST" }),
      /** Straight into storage. A Word file goes as the text the wiki import
       *  reads out of it — the model can't open .docx itself. */
      async upload(file: File): Promise<TrainingFile> {
        let body: Blob = file;
        let name = file.name;
        if (detectImportExt(file) === "docx") {
          const { html } = await importFile(file);
          body = new Blob([html], { type: "text/html" });
          name = `${file.name}.html`;
        }
        if (body.size > MAX_TRAINING_FILE_BYTES) throw new Error("too-large");
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": body.type || "text/plain" },
          body,
        });
        if (!res.ok) throw new Error("upload-failed");
        const { storageId } = (await res.json()) as { storageId: string };
        return { storageId, name };
      },
    }),
    [client, generateUploadUrl],
  );
}
