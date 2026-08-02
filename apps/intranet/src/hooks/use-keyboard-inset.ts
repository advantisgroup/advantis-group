"use client";

import { useEffect, useState } from "react";

/**
 * Pixels along the bottom of the layout viewport currently covered by the
 * on-screen keyboard, or 0 when it's closed.
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
      setInset(covered > 80 ? covered : 0);
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
