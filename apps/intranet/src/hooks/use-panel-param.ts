"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * The `?open=<id>` side panel shared by the tickets, suggestions, error
 * reports and measures lists — kept in the URL so a panel can be linked to.
 */
export function usePanelParam(basePath: string) {
  const router = useRouter();
  const params = useSearchParams();
  return {
    openId: params.get("open"),
    openPanel: (id: string) => router.replace(`${basePath}?open=${id}`, { scroll: false }),
    closePanel: () => router.replace(basePath, { scroll: false }),
  };
}

/** Copies the shareable link to one item's panel. */
export function copyPanelLink(basePath: string, id: string): Promise<void> {
  return navigator.clipboard.writeText(`${window.location.origin}${basePath}?open=${id}`);
}
