import Image from "next/image";

import { cn } from "@/lib/utils";

/*
 * Real artwork, both themes, no JavaScript.
 *
 * The old hooks picked a PNG from `useTheme()`, which means nothing is right
 * until next-themes has mounted — so every page began on the light-theme logo
 * and swapped after hydration. Rendering both and letting the `dark:` variant
 * choose puts the decision in CSS, where it costs nothing and never flashes.
 *
 * The lockup's black is #271D17, a warm near-black drawn for paper, so it is
 * the ink of the page rather than a rectangle of pure black sitting on it.
 */
const ART = {
  lockup: {
    light: "/logos/advantis-group-lockup-black.svg",
    dark: "/logos/advantis-group-lockup-white.svg",
    ratio: 876 / 88,
  },
  mark: {
    light: "/logos/advantis-mark-black.svg",
    dark: "/logos/advantis-mark-white.svg",
    ratio: 178 / 122,
  },
  /** The mark in the brand pink — for when it is the subject, not the chrome. */
  markBrand: {
    light: "/logos/advantis-mark.svg",
    dark: "/logos/advantis-mark.svg",
    ratio: 178 / 122,
  },
} as const;

/** Width the artwork draws at a given height. */
export const logoWidth = (variant: keyof typeof ART, height: number) =>
  Math.round(height * ART[variant].ratio);

export const Logo = ({
  variant = "lockup",
  height = 20,
  className,
  alt = "ADVANTIS GROUP",
  inverse = false,
}: {
  variant?: keyof typeof ART;
  /** Drawn height in px; the width follows from the artwork's own ratio. */
  height?: number;
  className?: string;
  /** Empty when something next to it already names the company. */
  alt?: string;
  /** For an inverted band (`bg-foreground`), which is dark in light mode and light in dark. */
  inverse?: boolean;
}) => {
  const art = inverse
    ? { ...ART[variant], light: ART[variant].dark, dark: ART[variant].light }
    : ART[variant];
  const width = logoWidth(variant, height);
  const shared = "block h-auto w-auto max-w-none";

  return (
    <span className={cn("inline-flex shrink-0", className)} style={{ height }}>
      <Image
        src={art.light}
        alt={alt}
        width={width}
        height={height}
        className={cn(shared, "dark:hidden")}
        priority
      />
      <Image
        src={art.dark}
        alt=""
        aria-hidden
        width={width}
        height={height}
        className={cn(shared, "hidden dark:block")}
        priority
      />
    </span>
  );
};
