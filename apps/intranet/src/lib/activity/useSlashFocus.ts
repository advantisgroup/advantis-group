"use client";

import { useEffect, useRef } from "react";

/**
 * Focus (and select) the referenced input when "/" is pressed anywhere on the
 * page — unless the user is already typing in a field. Attach the returned ref
 * to the page's search box.
 */
export function useSlashFocus<T extends HTMLInputElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName))
      ) {
        return;
      }
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return ref;
}
