/**
 * The four group brands, in one place.
 *
 * `brandText` is both the `BrandText` variant and the anchor id used by
 * `/brands#…`, so the homepage rows link to the matching block. `accent` is
 * the CSS variable each brand recolours with — the tokens exist in
 * `global.css`; before this they were only ever used to tint the wordmark.
 *
 * `status` is `"soon"` for the two brands that have not launched. They are
 * still worth naming — the group is four brands, and saying so is the
 * positioning — but they render without their colour, carry a label, and do
 * not link out to sites that are not up yet.
 */
export const BRANDS = [
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
    url: "https://oldschool-train.de",
    status: "soon",
  },
  {
    key: "salesai",
    name: "Sales-AI-Germany",
    brandText: "sales-ai-germany",
    accent: "var(--sales-ai)",
    url: "https://sales-ai-germany.de",
    status: "soon",
  },
] as const satisfies readonly {
  key: string;
  name: string;
  brandText: "salespirates" | "rodeo" | "oldschool-train" | "sales-ai-germany";
  accent: string;
  url: string;
  status: "live" | "soon";
}[];

export type Brand = (typeof BRANDS)[number];
