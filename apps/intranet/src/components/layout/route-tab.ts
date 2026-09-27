import type { MouseEvent } from "react";

import type { LucideIcon } from "lucide-react";

export interface RouteTab {
  value: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional count badge next to the label (e.g. open appointments). */
  count?: number;
  /** For tabs kept in a query param (`?tab=`) rather than their own route:
   * called instead of following `href`, which stays as the link's target so
   * it can still be opened in a new tab. */
  onSelect?: () => void;
}

/** Click handler for a tab's link: hands the click to `onSelect` when the tab
 * has one, so a query-param tab switches without a second navigation. */
export function routeTabClick(tab: RouteTab) {
  if (!tab.onSelect) return undefined;
  const select = tab.onSelect;
  return (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    select();
  };
}
