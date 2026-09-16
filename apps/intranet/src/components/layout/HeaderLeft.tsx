"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { CommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

/** Below this the search field stops being worth its width. */
const SEARCH_MIN_PX = 440;
/** Breathing room kept between the page's title/tabs and the search field. */
const CLEARANCE_PX = 32;
/** Extra room needed before a folded search opens back up, so it doesn't flicker at the edge. */
const REOPEN_PX = 24;

/**
 * The header's left side: whatever the page puts there (title, tabs) plus
 * search. The page's own content always gets its full width first; search
 * takes what's left and folds down to just its icon when that isn't enough —
 * so no page has to opt out of search to fit its tabs.
 */
export function HeaderLeft({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  // The content's full width, taken while it isn't allowed to shrink — once
  // search folds the content may squeeze, and its width then says nothing.
  const neededRef = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const apply = (next: boolean) => {
      compactRef.current = next;
      setCompact(next);
    };

    const measure = () => {
      if (!compactRef.current) neededRef.current = content.scrollWidth;
      const needed = neededRef.current;
      if (needed === 0) return apply(false);
      const free = container.clientWidth - needed - CLEARANCE_PX;
      if (!compactRef.current && free < SEARCH_MIN_PX) apply(true);
      else if (compactRef.current && free >= SEARCH_MIN_PX + REOPEN_PX) apply(false);
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(container);
    resize.observe(content);
    // New title or tabs: measure them again at full width before deciding.
    const mutations = new MutationObserver(() => {
      apply(false);
      requestAnimationFrame(measure);
    });
    mutations.observe(content, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <div
        ref={contentRef}
        className={cn(
          "flex items-center",
          compact ? "min-w-0 shrink" : "min-w-0 shrink md:shrink-0",
        )}
      >
        {children}
      </div>
      <div className={compact ? "hidden shrink-0 md:flex" : "hidden min-w-0 flex-1 md:flex"}>
        <CommandPalette compact={compact} />
      </div>
    </div>
  );
}
