/**
 * The PDFs picked in this tab, by the run reading them (or a one-off key for a
 * manual entry). A File can't be kept anywhere durable, so after a refresh
 * this is empty — the runs still finish on their own and keep their own copy.
 */
const files = new Map<string, File>();

export const cvImportFiles = {
  set: (key: string, file: File) => void files.set(key, file),
  get: (key: string): File | null => files.get(key) ?? null,
};
