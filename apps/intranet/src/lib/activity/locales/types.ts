/** Shared i18n types. The dictionaries live in de.ts / en.ts; the provider
 * and hook stay in ../i18n.tsx so existing `@/lib/i18n` imports are unchanged. */
export type Lang = "de" | "en";
export type Dict = Record<string, string>;
