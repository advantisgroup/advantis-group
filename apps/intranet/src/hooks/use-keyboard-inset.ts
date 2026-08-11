"use client";

import { useEffect, useState } from "react";

/**
 * Chrome's autofill/accessory bar (password suggestions, form nav arrows)
 * renders above the on-screen keyboard as the browser's own UI chrome, not
 * the page's — and unlike the keyboard itself, it isn't reliably reflected
 * in `visualViewport`'s size. Some Chrome versions shrink the viewport to
 * exclude it, some render it as an overlay on top without shrinking
 * anything further, and it can appear (or resize as suggestions load)
 * without firing another `resize`/`scroll` event at all. There's no API
 * that exposes its actual height, so this is added as a fixed safety
 * margin on top of the measured inset rather than trusting the raw
 * measurement — a slightly-too-tall gap above the keyboard is a much
 * smaller problem than an input or send button silently hidden behind it.
 */
const ACCESSORY_BAR_BUFFER = 56;

/**
 * Pixels along the bottom of the layout viewport currently covered by the
 * on-screen keyboard (plus a safety margin for browser accessory UI above
 * it — see `ACCESSORY_BAR_BUFFER`), or 0 when it's closed.
 *
 * The layout viewport doesn't shrink when the keyboard opens — only the
 * visual viewport does — so `position: fixed; bottom: 0` lands *behind* the
 * keyboard rather than above it. Anything that has to stay reachable while
 * typing needs this offset.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      // Browser chrome sliding in and out moves this by a few dozen pixels on
      // its own; only a keyboard takes a meaningful bite.
      setInset(covered > 80 ? covered + ACCESSORY_BAR_BUFFER : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
