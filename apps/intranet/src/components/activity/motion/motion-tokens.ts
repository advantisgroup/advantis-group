/**
 * Shared motion timing tokens so every animated primitive feels like one system
 * rather than a grab-bag of ad-hoc durations. Mirrors the Tailwind keyframe
 * timings already used elsewhere (220ms enter / 180ms exit, snappy ease-out).
 *
 * Accessibility note: the primitives in this folder also call framer-motion's
 * `useReducedMotion()` and collapse to opacity-only / instant transitions when
 * the user prefers reduced motion — belt-and-suspenders with the global CSS rule
 * in `globals.css`.
 */
export const MOTION = {
  /** Quick reveals (inline messages, crossfades). */
  fast: 0.18,
  /** Default for panels, list items, height changes. */
  base: 0.22,
  /** easeOutExpo-ish — matches the app's brisk, settled feel. */
  ease: [0.16, 1, 0.3, 1] as const,
} as const;
