"use client";

import { useEffect, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

/** `undefined` while preferences load, so a page can wait rather than flash
 * the wrong design for a moment. */
export function useDesignPreview(): "refreshed" | "classic" | undefined {
  const prefs = useQuery(api.userPreferences.getMine);
  if (prefs === undefined) return undefined;
  return prefs?.designPreview === "refreshed" ? "refreshed" : "classic";
}

/** Picks a page's refreshed or classic version from the person's preview choice. */
export function DesignSwitch({ refreshed, classic }: { refreshed: ReactNode; classic: ReactNode }) {
  const design = useDesignPreview();
  if (design === undefined) return null;
  return <>{design === "refreshed" ? refreshed : classic}</>;
}

/**
 * Mirrors the preview choice onto `<html data-design>` for the `refreshed:`
 * CSS variant. On the root element rather than the shell, so dialogs, panels
 * and menus portalled out to `<body>` pick it up too.
 */
export function DesignAttribute() {
  const design = useDesignPreview();

  useEffect(() => {
    if (!design) return;
    document.documentElement.dataset.design = design;
    return () => {
      delete document.documentElement.dataset.design;
    };
  }, [design]);

  return null;
}
