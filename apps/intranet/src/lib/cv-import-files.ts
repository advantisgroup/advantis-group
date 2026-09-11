/**
 * The PDFs picked in this tab, by the run reading them. A File can't be kept
 * anywhere durable, so after a refresh this is empty — the runs still finish
 * on their own; only "enter manually" needs the original file back.
 */
const files = new Map<string, File>();

export const cvImportFiles = {
  set: (runId: string, file: File) => void files.set(runId, file),
  get: (runId: string): File | null => files.get(runId) ?? null,
};
