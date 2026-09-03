"use client";

import React from "react";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Building2, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { useSingleLetterLogo } from "@/hooks/use-logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "@/i18n/navigation";
import { isAuthRoute } from "@/lib/utils";

import { SettingsMenu } from "./SettingsMenu";
import { AccountMenu } from "../auth/AccountMenu";

const SCROLL_THRESHOLD = 60;
const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export const Header = () => {
  const pathname = usePathname();
  const logo = useSingleLetterLogo();
  const isMobile = useIsMobile();
  const t = useTranslations("nav");
  const { scrollY } = useScroll();
  const intranetUrl = useCompanyIntranetUrl();

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [navMenuOpen, setNavMenuOpen] = React.useState(false);
  const navMenuRef = React.useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [isScrolled, setIsScrolled] = React.useState(false);
  const scrollYRef = React.useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > SCROLL_THRESHOLD);
  });

  React.useEffect(() => {
    if (!isMobile && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [isMobile, mobileMenuOpen]);

  React.useEffect(() => {
    if (!navMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!navMenuRef.current?.contains(event.target as Node)) setNavMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navMenuOpen]);

  // Route changes should not leave either menu hanging open.
  React.useEffect(() => {
    setNavMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!isMobile || !mobileMenuOpen) {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.documentElement.style.overflow = "";
      return;
    }

    scrollYRef.current = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.documentElement.style.overflow = "";
      window.scrollTo(0, scrollYRef.current);
    };
  }, [isMobile, mobileMenuOpen]);

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
    { key: "about", label: t("about"), path: "/about" },
    { key: "brands", label: t("brands"), path: "/brands" },
    { key: "team", label: t("team"), path: "/team" },
    { key: "blog", label: t("blog"), path: "/blog" },
    { key: "whitepaper", label: t("whitepaper"), path: "/whitepaper" },
    { key: "contact", label: t("contact"), path: "/contact" },
  ];

  const transition = { duration: 0.4, ease: EASE };

  return (
    /*
     * At the top of the page the bar carries no chrome at all — no fill, no
     * rule, no shadow — so the headline underneath it is the first thing in
     * the viewport. All of it materialises on scroll, once the bar genuinely
     * needs to separate itself from the content passing beneath.
     */
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
        {/* ── LEFT: Logo + collapsing wordmark ── */}
        {!isMobile ? (
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
        ) : (
          <Link
            href="/"
            className="group relative -my-1 flex items-center gap-1 py-1 font-sans text-lg font-bold"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePosition({ x: 0, y: 0 })}
            style={{
              transform: `translate(${mousePosition.x * 0.18}px, ${mousePosition.y * 0.18}px)`,
              transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            <div className="relative w-8 h-8 mr-1">
              <Image src={logo} alt="Advantis Logo" fill className="object-contain" sizes="32px" />
            </div>
            <span className="group-hover:text-advantis transition-colors duration-500">
              ADVANTIS
            </span>
            <span className="group-hover:text-foreground transition-colors duration-500">
              GROUP
            </span>
          </Link>
        )}

        {/* ── RIGHT: one menu ── */}
        <div ref={navMenuRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setNavMenuOpen((open) => !open)}
            aria-expanded={navMenuOpen}
            aria-haspopup="true"
            className={`group/trigger inline-flex items-center border py-2 text-sm transition-colors duration-300 ${
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
                className="absolute right-0 top-[calc(100%+0.75rem)] w-[34rem] border border-rule bg-popover shadow-2xl shadow-black/20"
              >
                {/* One card per destination: label plus what is actually there. */}
                <ul className="grid grid-cols-2 gap-px bg-rule">
                  {navLinks.map((link) => (
                    <li
                      key={link.key}
                      className={`bg-popover ${navLinks.length % 2 === 1 ? "last:col-span-2" : ""}`}
                    >
                      <Link
                        href={link.path}
                        onClick={() => setNavMenuOpen(false)}
                        className={`block h-full p-4 transition-colors duration-200 hover:bg-card ${
                          pathname === link.path ? "bg-card" : ""
                        }`}
                      >
                        <span className="block font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.02em]">
                          {link.label}
                        </span>
                        <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                          {t(`descriptions.${link.key}`)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/* Language and appearance sit here as plain rows rather than
                    behind a second popover opened from inside this one. */}
                <div className="border-t border-rule p-4">
                  <SettingsMenu inline />
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-rule p-3">
                  {intranetUrl ? (
                    <Link
                      href={intranetUrl}
                      onClick={() => setNavMenuOpen(false)}
                      className="inline-flex items-center gap-1.5 border border-advantis bg-advantis px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition-colors hover:bg-advantis/90"
                    >
                      <Building2 className="size-3.5" />
                      <span>{t("intranet")}</span>
                    </Link>
                  ) : (
                    <span />
                  )}

                  <AccountMenu />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile burger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 relative group/menu"
          aria-label={t("toggleMenu")}
        >
          <div className="absolute inset-0 opacity-0 group-hover/menu:opacity-100 transition-opacity duration-300 blur-md bg-advantis/10 rounded-full" />

          <div className="space-y-1.5 relative z-10">
            <span
              className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${
                mobileMenuOpen ? "rotate-45 translate-y-2" : "group-hover/menu:w-5"
              }`}
            />
            <span
              className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${
                mobileMenuOpen ? "opacity-0" : "group-hover/menu:bg-advantis"
              }`}
            />
            <span
              className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${
                mobileMenuOpen ? "-rotate-45 -translate-y-2" : "group-hover/menu:w-4"
              }`}
            />
          </div>
        </button>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="border-t border-rule bg-background md:hidden"
          >
            <div className="mx-auto w-full max-w-[1440px] px-5 py-4">
              {/*
               * The same destination cards as the desktop menu, at full width.
               * Previously these were 20px-tall text links — well under a
               * comfortable touch target — with no indication of what each
               * page held.
               */}
              <ul className="grid gap-px border-y border-rule bg-rule">
                {navLinks.map((link) => (
                  <li key={`mobile_${link.key}`} className="bg-background">
                    <Link
                      href={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block px-1 py-3.5 transition-colors ${
                        pathname === link.path ? "text-foreground" : ""
                      }`}
                    >
                      <span className="block font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.02em]">
                        {link.label}
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                        {t(`descriptions.${link.key}`)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Language and appearance inline, as on desktop — not behind a drawer. */}
              <div className="border-b border-rule py-5">
                <SettingsMenu inline onMobileNavigate={() => setMobileMenuOpen(false)} />
              </div>

              <div className="flex flex-col gap-3 pt-5">
                {intranetUrl && (
                  <Link
                    href={intranetUrl}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex min-h-11 items-center justify-center gap-1.5 border border-advantis bg-advantis px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition-colors hover:bg-advantis/90"
                  >
                    <Building2 className="size-4" />
                    <span>{t("intranet")}</span>
                  </Link>
                )}
                <AccountMenu isMobile onMobileNavigate={() => setMobileMenuOpen(false)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
