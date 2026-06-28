/**
 * Structure of the in-app Help / FAQ. Content is not stored here — each entry id
 * maps to localized strings `faq.q.<id>` (question) and `faq.a.<id>` (answer),
 * and each section to `faq.section.<id>`, in lib/locales/{de,en}.ts. Keeping the
 * structure data-driven means adding a Q&A is just two translation keys.
 *
 * Each entry also carries a `scope` so the reader can tell at a glance whether a
 * question is about the desktop tracker (the agent on each PC), the dashboard
 * (this web app), or both — the labels live under `faq.scope.<scope>`.
 */
export type FaqScope = "desktop" | "dashboard" | "both";

export interface FaqEntry {
  id: string;
  scope: FaqScope;
}

export interface FaqSection {
  id: string;
  /** Entries, in display order. */
  entries: FaqEntry[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "access",
    entries: [
      { id: "signin_denied", scope: "dashboard" },
      { id: "domain", scope: "dashboard" },
      { id: "roles", scope: "dashboard" },
      { id: "add_admin", scope: "dashboard" },
    ],
  },
  {
    id: "tracker",
    entries: [
      { id: "not_reporting", scope: "desktop" },
      { id: "offline", scope: "desktop" },
      { id: "enroll_failed", scope: "desktop" },
      { id: "debug_password", scope: "desktop" },
    ],
  },
  {
    id: "integrations",
    entries: [
      { id: "integration_down", scope: "dashboard" },
      { id: "clockodo_setup", scope: "dashboard" },
    ],
  },
  {
    id: "general",
    entries: [
      { id: "privacy", scope: "both" },
      { id: "retention", scope: "dashboard" },
      { id: "add_person", scope: "dashboard" },
      { id: "approve_device", scope: "dashboard" },
    ],
  },
];

/** All entry ids flattened — handy for search/iteration. */
export const FAQ_ENTRY_IDS: string[] = FAQ_SECTIONS.flatMap((s) =>
  s.entries.map((e) => e.id),
);
