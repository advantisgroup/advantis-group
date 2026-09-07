"use client";

import React from "react";

import { usePathname } from "next/navigation";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { Link } from "@/i18n/navigation";

import { SettingsMenu } from "./SettingsMenu";
import { AccountMenu } from "../auth/AccountMenu";

interface NavLink {
  key: string;
  label: string;
  path: string;
}

type Stage = "closed" | "centered" | "open";

/**
 * Mobile nav lives entirely off the header now: a small round button
 * anchored bottom-right hops to bottom-center (a bouncy layout animation,
 * not a manual keyframe) and only once that hop lands does it grow into the
 * drawer — two separate `stage` transitions sharing one animated shape via
 * framer-motion's `layout` prop.
 */
export const MobileNavFab = ({ navLinks }: { navLinks: NavLink[] }) => {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const intranetUrl = useCompanyIntranetUrl();

  const [stage, setStage] = React.useState<Stage>("closed");
  const scrollYRef = React.useRef(0);
  const isOpen = stage !== "closed";

  React.useEffect(() => {
    setStage("closed");
  }, [pathname]);

  // The hop to center is a springy layout animation — waiting on its own
  // onLayoutAnimationComplete would only fire once the spring fully damps
  // out, which lags well past the point it visually looks arrived. A fixed
  // beat keeps the two-stage choreography (hop, then expand) predictable.
  React.useEffect(() => {
    if (stage !== "centered") return;
    const id = setTimeout(() => setStage("open"), 380);
    return () => clearTimeout(id);
  }, [stage]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStage("closed");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Only lock scroll once the drawer is actually open — the bounce-to-center
  // hop still plays out over the live page.
  React.useEffect(() => {
    if (stage !== "open") {
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
  }, [stage]);

  const close = () => setStage("closed");

  return (
    <div className="md:hidden">
      <AnimatePresence>
        {stage === "open" && (
          <motion.div
            key="fab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
          stage === "closed" ? "justify-end" : "justify-center"
        }`}
      >
        <motion.div
          layout
          transition={{
            type: "spring",
            stiffness: stage === "open" ? 300 : 500,
            damping: stage === "open" ? 28 : 20,
            mass: 0.6,
          }}
          className={`pointer-events-auto overflow-hidden border border-rule shadow-2xl shadow-black/20 ${
            stage === "open"
              ? "flex w-full max-w-[26rem] flex-col rounded-t-2xl bg-background"
              : "h-14 w-14 rounded-full bg-background/85 backdrop-blur-xl"
          }`}
          style={stage === "open" ? { maxHeight: "80vh" } : undefined}
        >
          <AnimatePresence mode="wait" initial={false}>
            {stage === "open" ? (
              <motion.div
                key="fab-drawer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-rule px-5 py-4">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    {t("menuLabel")}
                  </span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t("closeMenu")}
                    className="-mr-1.5 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="px-5 py-4">
                  <ul className="divide-y divide-rule">
                    {navLinks.map((link) => (
                      <li key={`fab_${link.key}`}>
                        <Link
                          href={link.path}
                          onClick={close}
                          className={`block py-3.5 transition-colors ${
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

                  <div className="border-t border-rule py-5">
                    <SettingsMenu inline onMobileNavigate={close} />
                  </div>

                  <div className="flex flex-col gap-3 border-t border-rule pt-5 pb-1">
                    {intranetUrl && (
                      <Link
                        href={intranetUrl}
                        onClick={close}
                        className="flex min-h-11 items-center justify-center gap-1.5 border border-rule-strong px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-foreground hover:bg-card"
                      >
                        <Building2 className="size-4" />
                        <span>{t("intranet")}</span>
                      </Link>
                    )}
                    <AccountMenu isMobile onMobileNavigate={close} />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="fab-trigger"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={() => {
                  if (stage === "closed") setStage("centered");
                }}
                aria-label={t("toggleMenu")}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className="flex h-full w-full items-center justify-center"
              >
                <Menu className="size-5" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
};
