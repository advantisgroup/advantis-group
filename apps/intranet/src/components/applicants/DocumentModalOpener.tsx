"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";

interface OpenableDocument {
  storageId: string;
  fileName: string;
  url: string | null;
}

/**
 * Bridges a URL-driven document route to the app's global file viewer:
 * opens it on mount, closing navigates back (via the onClose override) so
 * the browser back button and the viewer's own close button both land back
 * on the Dokumente list underneath. The effect's cleanup closes the viewer
 * when this route unmounts for any other reason.
 */
export function DocumentModalOpener({
  document,
}: {
  document: OpenableDocument;
}) {
  const router = useRouter();
  const { openFileViewer, closeFileViewer } = useFileViewer();

  useEffect(() => {
    openFileViewer(
      {
        storageId: document.storageId,
        name: document.fileName,
        url: document.url ?? undefined,
      },
      { onClose: () => router.back() }
    );
    return () => closeFileViewer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per document identity, not on every router/context re-render
  }, [document.storageId]);

  return null;
}
