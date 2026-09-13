"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { CommandPalette } from "@/components/CommandPalette";

/** Below this the search field stops being worth its width. */
const SEARCH_MIN_PX = 280;
/** Breathing room kept between the page's title/tabs and the search field. */
const CLEARANCE_PX = 32;

/**
 * The header's left side: whatever the page puts there (title, tabs) plus
 * search. Search measures what's left once the page's own content has its
 * natural width, and folds down to just its icon when a full field would
 * crowd it — so no page has to opt out of search to fit its tabs.
 */
export function HeaderLeft({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      // scrollWidth, not width: tabs that are already squeezed still report
      // the room they'd need to show in full.
      const needed = Array.from(content.children).reduce(
        (sum, child) => sum + (child as HTMLElement).scrollWidth,
        0,
      );
      const free = container.clientWidth - needed - CLEARANCE_PX;
      setCompact(needed > 0 && free < SEARCH_MIN_PX);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    const mutations = new MutationObserver(measure);
    mutations.observe(content, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="flex min-w-0 flex-1 items-center justify-start gap-2">
      <div ref={contentRef} className="flex min-w-0 items-center">
        {children}
      </div>
      <div className={compact ? "hidden shrink-0 md:flex" : "hidden w-full min-w-0 md:flex"}>
        <CommandPalette compact={compact} />
      </div>
    </div>
  );
}
