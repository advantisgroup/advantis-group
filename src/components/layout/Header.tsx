"use client";

import React from "react";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { useSingleLetterLogo } from "@/hooks/use-logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "@/i18n/navigation";

import { SettingsMenu } from "./SettingsMenu";
import { AccountMenu } from "../auth/AccountMenu";
import { ShimmerText } from "../effects/Shimmer";

export const Header = () => {
  const pathname = usePathname();
  const logo = useSingleLetterLogo();
  const isMobile = useIsMobile();
  const t = useTranslations("nav");

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const scrollYRef = React.useRef(0);

  React.useEffect(() => {
    if (!isMobile && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [isMobile, mobileMenuOpen]);

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

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2,
    });
  };

  const navLinks = [
    { label: t("about"), path: "/about" },
    { label: t("brands"), path: "/brands" },
    { label: t("team"), path: "/team" },
    { label: t("contact"), path: "/contact" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 transition-all duration-300 border-b border-border shadow-sm">
      <nav className="container mx-auto flex items-center justify-between h-16 px-4">
        {!isMobile ? (
          <Link
            href="/"
            className="group relative flex items-center gap-1 font-bold text-lg font-sans"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePosition({ x: 0, y: 0 })}
            style={{
              transform: `translate(${mousePosition.x * 0.18}px, ${mousePosition.y * 0.18}px)`,
              transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            <div className="relative w-8 h-8 mr-1">
              <Image
                src={logo}
                alt="Advantis Logo"
                fill
                className="object-contain"
                sizes="32px"
              />
            </div>
            <ShimmerText
              duration="8s"
              className="group-hover:text-advantis transition-colors duration-300"
            >
              ADVANTIS
            </ShimmerText>
            <ShimmerText
              duration="6s"
              className="group-hover:text-foreground transition-colors duration-300"
            >
              GROUP
            </ShimmerText>
          </Link>
        ) : (
          <Link
            href="/"
            className="group relative flex items-center gap-1 font-bold text-lg font-sans"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePosition({ x: 0, y: 0 })}
            style={{
              transform: `translate(${mousePosition.x * 0.18}px, ${mousePosition.y * 0.18}px)`,
              transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            <div className="relative w-8 h-8 mr-1">
              <Image
                src={logo}
                alt="Advantis Logo"
                fill
                className="object-contain"
                sizes="32px"
              />
            </div>
            <ShimmerText className="group-hover:text-advantis transition-colors duration-500">
              ADVANTIS
            </ShimmerText>
            <ShimmerText className="group-hover:text-foreground transition-colors duration-500">
              GROUP
            </ShimmerText>
          </Link>
        )}

        <div className="hidden md:flex items-center gap-4">
          <ul className="flex items-center gap-6 text-sm">
            {navLinks.map((link, i) => (
              <li key={`${link.label}_${i}`}>
                <Link
                  href={link.path}
                  className={`relative transition-colors group/link ${
                    pathname === link.path
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="relative z-10">{link.label}</span>
                  <span
                    className={`absolute bottom-0 left-0 h-0.5 bg-linear-to-r from-advantis to-advantis/50 transition-all duration-300 ease-out ${
                      pathname === link.path
                        ? "w-full"
                        : "w-0 group-hover/link:w-full"
                    }`}
                  />
                  <span className="absolute inset-0 opacity-0 group-hover/link:opacity-100 transition-opacity duration-300 blur-sm bg-advantis/5" />
                </Link>
              </li>
            ))}
          </ul>
          <AccountMenu />
          <SettingsMenu />
        </div>

        {/* Mobile Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 relative group/menu"
          aria-label={t("toggleMenu")}
        >
          <div className="absolute inset-0 opacity-0 group-hover/menu:opacity-100 transition-opacity duration-300 blur-md bg-advantis/10 rounded-full" />

          <div className="space-y-1.5 relative z-10">
            <span
              className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${
                mobileMenuOpen
                  ? "rotate-45 translate-y-2"
                  : "group-hover/menu:w-5"
              }`}
            />
            <span
              className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${
                mobileMenuOpen ? "opacity-0" : "group-hover/menu:bg-advantis"
              }`}
            />
            <span
              className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${
                mobileMenuOpen
                  ? "-rotate-45 -translate-y-2"
                  : "group-hover/menu:w-4"
              }`}
            />
          </div>
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="md:hidden border-t border-border bg-background"
          >
            <div className="container mx-auto px-4 py-4 space-y-4">
              <ul className="space-y-4">
                {navLinks.map((link, i) => (
                  <li
                    key={`mobile_${link.label}_${i}`}
                    className="animate-in slide-in-from-left-2 duration-300"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <Link
                      href={link.path}
                      className={`block text-sm hover:text-foreground hover:translate-x-1 transition-all duration-200 ${
                        pathname === link.path
                          ? "text-foreground font-medium translate-x-1"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <div
                className="pt-4 border-t border-border animate-in slide-in-from-left-2 duration-300"
                style={{ animationDelay: `${navLinks.length * 50}ms` }}
              >
                <AccountMenu
                  isMobile
                  onMobileNavigate={() => setMobileMenuOpen(false)}
                />
                <SettingsMenu
                  isMobile
                  onMobileNavigate={() => setMobileMenuOpen(false)}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
