export const PROFILE_GRADIENTS = {
  aurora: "from-cyan-400 via-sky-500 to-indigo-600",
  ocean: "from-sky-500 via-blue-600 to-violet-700",
  sunset: "from-amber-400 via-orange-500 to-rose-600",
  violet: "from-fuchsia-500 via-violet-600 to-indigo-700",
  rose: "from-rose-400 via-pink-500 to-purple-600",
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
