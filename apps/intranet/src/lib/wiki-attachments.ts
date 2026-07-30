import { type WikiAttachmentUpload } from "@/lib/onedrive-api";

/**
 * Uploads every staged file to OneDrive under `slug` and records each as a
 * guidebookAttachments row. Wiki entries/pages let files be dropped in
 * before the entry exists, but OneDrive's wiki-attach endpoint needs a real
 * slug — so this runs right after the create mutation resolves and a slug
 * is finally known, rather than while the file is still just sitting in
 * local state.
 *
 * Settles the whole batch (allSettled, not all) rather than aborting on the
 * first rejection — a sibling upload already in flight must be allowed to
 * finish and get recorded rather than becoming an orphaned OneDrive file
 * with no reference. `onFileUploaded` fires per successful file so the
 * caller can drop it from local staging; anything that failed is left in
 * place for the caller to retry without re-uploading what already
 * succeeded. Throws (after every file has settled) if anything failed, so
 * the caller still sees an error — but only for the files still pending.
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
  onFileUploaded?: (file: File) => void,
): Promise<void> {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const uploaded = await attachToWiki(slug, file, (fraction) =>
        onFileProgress?.(file, fraction),
      );
      await addAttachment({ slug, attachment: uploaded });
      onFileUploaded?.(file);
    }),
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
}
