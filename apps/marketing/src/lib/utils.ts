import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Whether `pathname` (from `next/navigation`'s `usePathname`, e.g.
 * "/de/sign-in" or "/en/sign-up/verify-email-address") is the Clerk
 * sign-in/sign-up flow — always the second segment, since `localePrefix:
 * "always"` guarantees the first segment is the locale. Used to hide the
 * marketing site's Header/Footer chrome around the auth cards, which have
 * their own minimal shell (see AuthShell). */
export function isAuthRoute(pathname: string): boolean {
  const segment = pathname.split("/").filter(Boolean)[1];
  return segment === "sign-in" || segment === "sign-up";
}

/** Whether `path` (a nav link's un-localized href, e.g. "/about") is the
 * current page or a page below it, given `pathname` from next-intl's
 * `usePathname` (locale-stripped, e.g. "/about" or "/about/team"). */
export function isActivePath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}
