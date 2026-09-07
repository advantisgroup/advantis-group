"use client";

import React from "react";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Building2, ChevronDown, FileText, Info, Mail, Newspaper, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSingleLetterLogo } from "@/hooks/use-logo";
import { Link } from "@/i18n/navigation";
import { isAuthRoute } from "@/lib/utils";

import { MobileNavFab } from "./MobileNavFab";
import { AccountMenu } from "../auth/AccountMenu";

const SCROLL_THRESHOLD = 60;
const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export const Header = () => {
  const pathname = usePathname();
  const logo = useSingleLetterLogo();
  const t = useTranslations("nav");
  const { scrollY } = useScroll();

  const [navMenuOpen, setNavMenuOpen] = React.useState(false);
  const navMenuRef = React.useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [isScrolled, setIsScrolled] = React.useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > SCROLL_THRESHOLD);
  });

  React.useEffect(() => {
    if (!navMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!navMenuRef.current?.contains(event.target as Node)) setNavMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavMenuOpen(false);
    };

    // Capture phase: the account menu's Radix trigger stops propagation on
    // pointerdown, so a bubble-phase listener never sees the click and this
    // menu stays open behind it — two overlapping popovers.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navMenuOpen]);

  // Route changes should not leave the desktop menu hanging open (the
  // mobile drawer handles its own route-change close in MobileNavFab).
  React.useEffect(() => {
    setNavMenuOpen(false);
  }, [pathname]);

  // The auth cards have their own minimal shell — the marketing chrome
  // would otherwise occlude them (see AuthShell).
  if (isAuthRoute(pathname)) return null;

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2,
    });
  };

  const navLinks = [
    { key: "about", label: t("about"), path: "/about", icon: Info },
    { key: "brands", label: t("brands"), path: "/brands", icon: Building2 },
    { key: "team", label: t("team"), path: "/team", icon: Users },
    { key: "blog", label: t("blog"), path: "/blog", icon: Newspaper },
    { key: "whitepaper", label: t("whitepaper"), path: "/whitepaper", icon: FileText },
    { key: "contact", label: t("contact"), path: "/contact", icon: Mail },
  ];

  const transition = { duration: 0.4, ease: EASE };

  return (
    <>
      {/*
       * At the top of the page the bar carries no chrome at all — no fill, no
       * rule, no shadow — so the headline underneath it is the first thing in
       * the viewport. All of it materialises on scroll, once the bar genuinely
       * needs to separate itself from the content passing beneath.
       */}
      <header
        className={`fixed top-0 right-0 left-0 z-50 border-b transition-[border-color,box-shadow,background-color,backdrop-filter] duration-500 ${
          isScrolled || navMenuOpen
            ? "border-rule bg-background/95 shadow-[0_2px_24px_hsl(var(--foreground)/0.07)] backdrop-blur-md"
            : "border-transparent bg-transparent"
        }`}
      >
        <motion.nav
          className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 md:px-10"
          animate={{ height: isScrolled ? 48 : 64 }}
          transition={transition}
        >
          {/*
           * ── LEFT: Logo + collapsing wordmark ──
           * Shared by mobile and desktop — mobile used to get a simpler,
           * non-collapsing variant to leave room for the burger button, but
           * with nav moved out to the bottom FAB there's no competing chrome
           * on the row any more, so the header stays this one clean brand mark
           * at every width.
           */}
          <Link
            href="/"
            className="group relative -my-1 flex items-center py-1 font-sans text-lg font-bold"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePosition({ x: 0, y: 0 })}
            style={{
              transform: `translate(${mousePosition.x * 0.18}px, ${mousePosition.y * 0.18}px)`,
              transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            {/* Logo mark — scales up as wordmark collapses */}
            <motion.div
              className="relative shrink-0"
              animate={{
                width: isScrolled ? 36 : 32,
                height: isScrolled ? 36 : 32,
                marginRight: isScrolled ? 0 : 4,
              }}
              transition={transition}
            >
              <Image src={logo} alt="Advantis Logo" fill className="object-contain" sizes="36px" />
            </motion.div>

            {/* Wordmark — collapses into the logo on scroll */}
            <motion.div
              className="flex gap-1 overflow-hidden whitespace-nowrap"
              animate={{
                maxWidth: isScrolled ? 0 : 200,
                opacity: isScrolled ? 0 : 1,
                x: isScrolled ? -8 : 0,
              }}
              transition={transition}
            >
              <span className="group-hover:text-advantis transition-colors duration-300">
                ADVANTIS
              </span>
              <span className="group-hover:text-foreground transition-colors duration-300">
                GROUP
              </span>
            </motion.div>
          </Link>

          {/* ── RIGHT: navigation, then you ── */}
          <div className="hidden items-center gap-2 md:flex">
            <div ref={navMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setNavMenuOpen((open) => !open)}
                aria-expanded={navMenuOpen}
                aria-haspopup="true"
                className={`group/trigger inline-flex items-center rounded-lg border py-2 text-sm transition-colors duration-300 ${
                  isScrolled ? "px-2.5" : "px-4"
                } ${
                  navMenuOpen
                    ? "border-rule-strong bg-card text-foreground"
                    : "border-transparent text-muted-foreground hover:border-rule hover:text-foreground"
                }`}
              >
                {/*
                 * The label collapses into the chevron on scroll, mirroring the
                 * wordmark collapsing into the logo mark on the left — so scrolling
                 * makes both ends of the bar smaller rather than just re-packing
                 * the same items into a tighter capsule.
                 */}
                <motion.span
                  className="overflow-hidden whitespace-nowrap"
                  animate={{
                    maxWidth: isScrolled && !navMenuOpen ? 0 : 90,
                    opacity: isScrolled && !navMenuOpen ? 0 : 1,
                    marginRight: isScrolled && !navMenuOpen ? 0 : 8,
                  }}
                  transition={transition}
                >
                  {t("menuLabel")}
                </motion.span>
                <ChevronDown
                  className={`size-4 shrink-0 transition-transform duration-300 ${navMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {navMenuOpen && (
                  <motion.div
                    key="nav-menu"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 top-[calc(100%+0.75rem)] w-[32rem] rounded-xl border border-rule bg-popover p-2 shadow-2xl shadow-black/20"
                  >
                    {/*
                     * Destinations only. Language, appearance and the account
                     * live in the avatar menu next door — one dropdown doing
                     * three unrelated jobs was the reason this one felt like a
                     * settings panel with links bolted on.
                     */}
                    <ul className="grid grid-cols-2 gap-1">
                      {navLinks.map((link) => (
                        <li key={link.key}>
                          <Link
                            href={link.path}
                            onClick={() => setNavMenuOpen(false)}
                            className={`group flex h-full items-start gap-3 rounded-lg p-3 transition-colors duration-200 hover:bg-card ${
                              pathname === link.path ? "bg-card" : ""
                            }`}
                          >
                            {/* Neutral, not primary: six red icons in one panel
                              re-spends the accent this site reserves for the
                              one real CTA. */}
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-rule bg-background/60 text-muted-foreground transition-colors group-hover:text-foreground">
                              <link.icon className="size-4" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.02em]">
                                {link.label}
                              </span>
                              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                                {t(`descriptions.${link.key}`)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AccountMenu />
          </div>
        </motion.nav>
      </header>
      <MobileNavFab navLinks={navLinks} />
    </>
  );
};
