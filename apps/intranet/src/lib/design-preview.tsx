"use client";

import type { ReactNode } from "react";

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
