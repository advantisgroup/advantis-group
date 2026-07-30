import { type WikiAttachmentUpload } from "@/lib/onedrive-api";

/**
 * Uploads every staged file to OneDrive under `slug` and records each as a
 * guidebookAttachments row. Wiki entries/pages let files be dropped in
 * before the entry exists, but OneDrive's wiki-attach endpoint needs a real
 * slug — so this runs right after the create mutation resolves and a slug
 * is finally known, rather than while the file is still just sitting in
 * local state.
 */
export async function attachPendingFiles(
  slug: string,
  files: File[],
  attachToWiki: (
    slug: string,
    file: File,
    onProgress?: (fraction: number) => void,
  ) => Promise<WikiAttachmentUpload>,
  addAttachment: (args: { slug: string; attachment: WikiAttachmentUpload }) => Promise<unknown>,
  onFileProgress?: (file: File, fraction: number) => void,
): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const uploaded = await attachToWiki(slug, file, (fraction) =>
        onFileProgress?.(file, fraction),
      );
      await addAttachment({ slug, attachment: uploaded });
    }),
  );
}
