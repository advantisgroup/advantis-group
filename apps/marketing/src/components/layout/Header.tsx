"use client";

import React from "react";

import { usePathname } from "next/navigation";

import { Building2, FileText, Info, Mail, Newspaper, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo, logoWidth } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Link, usePathname as useLocalePathname } from "@/i18n/navigation";
import { cn, isAuthRoute } from "@/lib/utils";

import { MobileNavFab } from "./MobileNavFab";
import { AccountMenu } from "../auth/AccountMenu";

const SCROLL_THRESHOLD = 24;
const HIDE_AFTER = 120;
const SCROLL_JITTER = 6;

/* The lockup's mark is 84.8% of the lockup's own height (the artwork sets it
   at scale 0.6111 inside an 88-unit box), so the monogram has to be drawn a
   shade smaller than the lockup or it grows during the swap. */
const LOCKUP_HEIGHT = 18;
const MARK_HEIGHT = 15;

/**
 * A bar that compacts once, and only once.
 *
 * At the top it is tall, transparent, and shows the full lockup, so the
 * headline underneath it is the first thing in the viewport. Past the first
 * scroll it settles into a shorter bar with a ground and a hairline, and the
 * wordmark gives way to the monogram — the same move anthropic.com makes.
 * Like there, it also slides away while you scroll down and comes back as
 * soon as you scroll up.
 *
 * What it does *not* do any more: follow the pointer, collapse the menu label
 * into a chevron, or re-pack its right-hand side. One thing changes, the rest
 * stays where you left it.
 */
export const Header = () => {
  const pathname = usePathname();
  const localePathname = useLocalePathname();
  const t = useTranslations("nav");
  const [compact, setCompact] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setCompact(y > SCROLL_THRESHOLD);
      // ignore tiny jitters (trackpads, iOS bounce) so the bar doesn't flicker
      if (Math.abs(y - lastY) < SCROLL_JITTER) return;
      setHidden(y > lastY && y > HIDE_AFTER);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // lets sticky bars further down the page slide up into the freed space
  React.useEffect(() => {
    document.documentElement.toggleAttribute("data-header-hidden", hidden);
  }, [hidden]);

  // The auth cards have their own minimal shell — the marketing chrome
  // would otherwise occlude them (see AuthShell).
  if (isAuthRoute(pathname)) return null;

  const navLinks = [
    { key: "about", label: t("about"), path: "/about", icon: Info },
    { key: "brands", label: t("brands"), path: "/brands", icon: Building2 },
    { key: "team", label: t("team"), path: "/team", icon: Users },
    { key: "blog", label: t("blog"), path: "/blog", icon: Newspaper },
    { key: "whitepaper", label: t("whitepaper"), path: "/whitepaper", icon: FileText },
    { key: "contact", label: t("contact"), path: "/contact", icon: Mail },
  ];

  const legalLinks = [
    { label: t("imprint"), path: "/imprint" },
    { label: t("privacy"), path: "/privacy" },
    { label: t("licenses"), path: "/licenses" },
    { label: t("cookies"), path: "/cookies" },
  ];
  const legalPath = legalLinks.find((link) => link.path === localePathname)?.path;

  // Contact is the one call to action on the bar, so it leaves the link row
  // and becomes the button on the right.
  const destinations = navLinks.filter((link) => link.key !== "contact");

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter,transform] duration-300 focus-within:translate-y-0",
          hidden && "-translate-y-full",
          compact
            ? "border-rule bg-background/85 backdrop-blur-md"
            : "border-transparent bg-transparent",
        )}
      >
        <nav
          className={cn(
            "mx-auto flex w-full max-w-[1200px] items-center justify-between gap-6 px-5 transition-[height] duration-300 md:px-10",
            compact ? "h-14" : "h-20",
          )}
        >
          <Link href="/" aria-label="ADVANTIS GROUP" className="flex items-center">
            {/*
             * Both marks are always in the DOM and cross-fade in place — the
             * monogram's left edge is the lockup's left edge, so the brand
             * does not shift sideways when the bar compacts. The box's width
             * animates so the nav can close the gap behind it.
             */}
            <span
              aria-hidden
              className="relative block transition-[width] duration-300"
              style={{
                height: LOCKUP_HEIGHT,
                width: compact
                  ? logoWidth("mark", MARK_HEIGHT)
                  : logoWidth("lockup", LOCKUP_HEIGHT),
              }}
            >
              <Logo
                variant="lockup"
                height={LOCKUP_HEIGHT}
                alt=""
                className={cn(
                  "absolute inset-y-0 left-0 transition-opacity duration-300",
                  compact ? "opacity-0" : "opacity-100",
                )}
              />
              <Logo
                variant="mark"
                height={MARK_HEIGHT}
                alt=""
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 transition-opacity duration-300",
                  compact ? "opacity-100" : "opacity-0",
                )}
              />
            </span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {destinations.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.path}
                  aria-current={pathname === link.path ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm transition-colors",
                    pathname === link.path
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/contact">{t("contact")}</Link>
            </Button>
            <AccountMenu />
          </div>
        </nav>

        {/* On the legal pages the four documents sit under the bar, so you can
            hop between them without going back through the footer. */}
        {legalPath ? (
          <div className="mx-auto flex w-full max-w-[1200px] gap-1 overflow-x-auto px-5 pb-2 md:px-10">
            {legalLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                aria-current={legalPath === link.path ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                  legalPath === link.path
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>
      <MobileNavFab navLinks={navLinks} />
    </>
  );
};
