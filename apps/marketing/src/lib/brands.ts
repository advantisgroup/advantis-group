/**
 * The group brands, in one place.
 *
 * `brandText` is both the `BrandText` variant and the anchor id used by
 * `/brands#…`, so the homepage rows link to the matching block. `accent` is
 * the CSS variable each brand recolours with.
 *
 * `status` is `"soon"` for a brand that has not launched: it renders without
 * its colour, carries a label, and does not link out. A live brand without
 * a `url` (KMUbrain, Oldschool-train, Sales-AI-Germany) is shown in full but
 * has no outbound link and no "learn more" either.
 */
export type Brand = {
  key: "salespirates" | "rodeo" | "oldschool" | "salesai" | "kmubrain";
  name: string;
  brandText: "salespirates" | "rodeo" | "oldschool-train" | "sales-ai-germany" | "kmubrain";
  accent: string;
  /** Leave out for a live brand without its own website: it is shown, but not linked. */
  url?: string;
  status: "live" | "soon";
};

export const BRANDS: readonly Brand[] = [
  {
    key: "kmubrain",
    name: "KMUbrain",
    brandText: "kmubrain",
    accent: "var(--kmubrain)",
    status: "live",
  },
  {
    key: "salespirates",
    name: "Salespirates",
    brandText: "salespirates",
    accent: "var(--salespirates)",
    url: "https://salespirates.de",
    status: "live",
  },
  {
    key: "rodeo",
    name: "Rodeo-Consulting",
    brandText: "rodeo",
    accent: "var(--rodeo)",
    url: "https://rodeoconsulting.de",
    status: "live",
  },
  {
    key: "oldschool",
    name: "Oldschool-train",
    brandText: "oldschool-train",
    accent: "var(--oldschool)",
    status: "live",
  },
  {
    key: "salesai",
    name: "Sales-AI-Germany",
    brandText: "sales-ai-germany",
    accent: "var(--sales-ai)",
    status: "live",
  },
];
