"use client";

import React from "react";

import { motion, useReducedMotion } from "framer-motion";
import { Building2, Cookie, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Drawer, DrawerClose, DrawerTitle } from "@/components/ui/drawer";
import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { Link, usePathname } from "@/i18n/navigation";
import { isActivePath } from "@/lib/utils";

import { SettingsMenu } from "./SettingsMenu";
import { AccountMenu } from "../auth/AccountMenu";

interface NavLink {
  key: string;
  label: string;
  path: string;
}

/**
 * Mobile navigation: a round button bottom-right, and a vaul drawer.
 *
 * This used to be one shape doing both jobs — the button hopped to the centre
 * on a spring, a 380ms timer then declared the hop "landed", and the same
 * element morphed into the drawer via framer's `layout` prop while its
 * contents cross-faded inside it. Three things could disagree: tapping twice
 * quickly left the timer pointing at a stage already left behind, an
 * interrupted spring stranded the shape between circle and sheet, and the
 * morphing container squashed the rows drawn inside it on the way through.
 *
 * vaul handles the sheet now — drag-to-dismiss, the snap back, the scroll
 * lock, focus, Escape — and the button does nothing but fade. Neither can
 * strand the other, because neither knows the other exists.
 */
export const MobileNavFab = ({ navLinks }: { navLinks: NavLink[] }) => {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const intranetUrl = useCompanyIntranetUrl();
  const prefersReducedMotion = useReducedMotion();

  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      {/* `pointer-events-none` while the drawer is up, so a tap on the fading
          button cannot re-open what is closing. */}
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("toggleMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        animate={{ opacity: open ? 0 : 1, scale: open ? 0.85 : 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
        className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[55] flex size-14 items-center justify-center rounded-full border border-rule bg-background/90 text-foreground shadow-overlay backdrop-blur-xl ${
          open ? "pointer-events-none" : ""
        }`}
      >
        <Menu className="size-5" />
      </motion.button>

      <Drawer open={open} onOpenChange={setOpen} ariaLabel={t("menuLabel")}>
        <div className="flex shrink-0 items-center justify-between px-5 py-3">
          <DrawerTitle className="text-[13px] font-medium text-muted-foreground">
            {t("menuLabel")}
          </DrawerTitle>
          <DrawerClose
            aria-label={t("closeMenu")}
            className="-mr-2 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </DrawerClose>
        </div>

        {/*
         * `data-lenis-prevent` or this does not scroll at all: Lenis takes
         * the wheel/touch stream for the whole document and applies it to the
         * page, which is scroll-locked while the drawer is up — so the rows
         * below the fold here were simply unreachable.
         */}
        <div
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <ul className="divide-y divide-rule border-y border-rule">
            {navLinks.map((link) => {
              const active = isActivePath(pathname, link.path);
              return (
                <li key={link.key}>
                  <Link
                    href={link.path}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className="block py-3.5"
                  >
                    <span className="flex items-center gap-2 text-base font-semibold tracking-[-0.015em]">
                      {link.label}
                      {active ? (
                        <span aria-hidden className="size-1.5 rounded-full bg-advantis" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {t(`descriptions.${link.key}`)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="space-y-4 py-5">
            <SettingsMenu onMobileNavigate={close} />
            {/* Sits with language and appearance rather than with the nav
                links — it's a preference, not a destination. */}
            <Link
              href="/cookies"
              onClick={close}
              className="flex min-h-11 items-center gap-2.5 rounded-lg border border-rule px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Cookie className="size-4" />
              {t("cookies")}
            </Link>
          </div>

          <div className="flex flex-col gap-3 border-t border-rule pt-5">
            {intranetUrl ? (
              <Link
                href={intranetUrl}
                onClick={close}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rule-strong px-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Building2 className="size-4" />
                {t("intranet")}
              </Link>
            ) : null}
            <AccountMenu isMobile onMobileNavigate={close} />
          </div>
        </div>
      </Drawer>
    </div>
  );
};
