"use client";

import { useEffect, useRef, type RefObject } from "react";

import Lenis from "lenis";

/**
 * Sitewide smooth scrolling, ported from `apps/marketing`'s `SmoothScrolling`
 * with the one structural difference that matters: **the intranet's window
 * never scrolls.**
 *
 * Marketing is an ordinary document, so it mounts `<ReactLenis root>` and lets
 * Lenis drive `window`. The intranet's shell is a full-height flex layout whose
 * scroll container is `<main>` (see `AppShell`). Mounting `root` here would
 * smooth a scroller that has no overflow while still swallowing wheel events —
 * the app would simply stop scrolling. So Lenis is constructed directly against
 * the container instead: `wrapper` is `<main>`, `content` the element holding
 * the page.
 *
 * `LenisOptions.wrapper`/`content` take live elements, not refs, which is the
 * other reason this isn't `<ReactLenis>` — the elements don't exist until after
 * the first commit, and nothing here needs the `useLenis` context.
 *
 * Two deliberate scope limits:
 *
 * - **Immersive routes opt out.** Chat, wiki-chat and the two composers size
 *   themselves to the viewport and manage their own inner scrollers; there is
 *   no page-level scroll to smooth, and inserting a content wrapper would break
 *   their `h-full` chain. `AppShell` only mounts this for `!immersive`.
 * - **`prefers-reduced-motion` disables it.** Easing a scroll is precisely the
 *   motion that setting asks us to drop, and Lenis has no built-in opt-out, so
 *   the instance is never created.
 *
 * Nested scrollers need `data-lenis-prevent` so a wheel over them scrolls
 * *them* rather than the page — `ScrollArea`'s viewport carries it centrally,
 * and Radix dialog/sheet bodies are outside `<main>` so they're unaffected.
 */
export function useSmoothScroll(
  wrapperRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): RefObject<Lenis | null> {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.08,
      duration: 1.0,
      smoothWheel: true,
      autoRaf: false,
    });
    lenisRef.current = lenis;

    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [wrapperRef, contentRef, enabled]);

  return lenisRef;
}
