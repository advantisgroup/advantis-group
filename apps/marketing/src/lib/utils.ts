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
