import type { CSSProperties } from "react";

export const PROFILE_GRADIENTS = {
  aurora: "from-cyan-400 via-sky-500 to-indigo-600",
  ocean: "from-sky-500 via-blue-600 to-violet-700",
  sunset: "from-amber-400 via-orange-500 to-rose-600",
  violet: "from-fuchsia-500 via-violet-600 to-indigo-700",
  rose: "from-rose-400 via-pink-500 to-purple-600",
} as const;

const PROFILE_GRADIENT_MIDPOINTS = {
  aurora: "#0ea5e9",
  ocean: "#2563eb",
  sunset: "#f97316",
  violet: "#7c3aed",
  rose: "#ec4899",
} as const;

export type ProfileGradient = keyof typeof PROFILE_GRADIENTS;

export function profileGradientClass(gradient: ProfileGradient | null | undefined): string {
  return `bg-gradient-to-br ${PROFILE_GRADIENTS[gradient ?? "aurora"]}`;
}

export function profileColorStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return {
    background: `linear-gradient(135deg, color-mix(in srgb, ${color} 72%, white), ${color}, color-mix(in srgb, ${color} 62%, black))`,
  };
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The identity copy sits over a user-selected colour. Pick the foreground
 * with the higher WCAG contrast ratio and use its inverse for the badges, so
 * semantic labels stay readable without muting the selected gradient.
 */
export function profileHeaderStyle(
  gradient: ProfileGradient | null | undefined,
  color: string | null | undefined,
): CSSProperties {
  const representative = color ?? PROFILE_GRADIENT_MIDPOINTS[gradient ?? "aurora"];
  const foreground =
    contrastRatio(representative, "#ffffff") >= contrastRatio(representative, "#171717")
      ? "#ffffff"
      : "#171717";
  const badgeSurface = foreground === "#ffffff" ? "#ffffff" : "#171717";
  const badgeForeground = foreground === "#ffffff" ? "#171717" : "#ffffff";

  return {
    ...profileColorStyle(color),
    "--profile-foreground": foreground,
    "--profile-badge-surface": badgeSurface,
    "--profile-badge-foreground": badgeForeground,
    "--profile-badge-border": foreground === "#ffffff" ? "#ffffff99" : "#17171799",
  } as CSSProperties;
}
