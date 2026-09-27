import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The custom scales from globals.css's @theme. Without them tailwind-merge
// reads e.g. `shadow-overlay` or `text-display-sm` as a colour, so merging it
// with a real shadow or text colour keeps or drops the wrong class.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["soft", "card", "card-hover", "overlay", "glow"],
      text: ["display-sm", "display-md"],
      radius: ["normal", "xxl"],
      tracking: ["tightest", "tighter"],
      font: ["display"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** URL-safe slug; `fallback` covers titles with no usable characters. */
export function slugify(input: string, fallback = "page"): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

/** Escapes text for use inside HTML, including attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
