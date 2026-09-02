/**
 * The four group brands, in one place.
 *
 * `brandText` is both the `BrandText` variant and the anchor id used by
 * `/brands#…`, so the homepage rows link to the matching block. `accent` is
 * the CSS variable each brand recolours with — the tokens exist in
 * `global.css`; before this they were only ever used to tint the wordmark.
 */
export const BRANDS = [
  {
    key: "salespirates",
    name: "Salespirates",
    brandText: "salespirates",
    accent: "var(--salespirates)",
    url: "https://salespirates.de",
  },
  {
    key: "rodeo",
    name: "Rodeo-Consulting",
    brandText: "rodeo",
    accent: "var(--rodeo)",
    url: "https://rodeoconsulting.de",
  },
  {
    key: "oldschool",
    name: "Oldschool-train",
    brandText: "oldschool-train",
    accent: "var(--oldschool)",
    url: "https://oldschool-train.de",
  },
  {
    key: "salesai",
    name: "Sales-AI-Germany",
    brandText: "sales-ai-germany",
    accent: "var(--sales-ai)",
    url: "https://sales-ai-germany.de",
  },
] as const satisfies readonly {
  key: string;
  name: string;
  brandText: "salespirates" | "rodeo" | "oldschool-train" | "sales-ai-germany";
  accent: string;
  url: string;
}[];

export type Brand = (typeof BRANDS)[number];
