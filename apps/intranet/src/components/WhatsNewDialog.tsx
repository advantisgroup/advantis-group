"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  BookOpen,
  Calendar,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  Plane,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Bump when shipping a release worth announcing; must match nothing stored. */
const RELEASE_KEY = "2026-07-tabs-polish";

const HIGHLIGHTS = [
  { key: "dashboard", href: "/", icon: LayoutDashboard },
  { key: "absences", href: "/absences", icon: Plane },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "announcements", href: "/announcements", icon: Megaphone },
  { key: "directory", href: "/directory", icon: Users },
  { key: "files", href: "/files", icon: FolderOpen },
  { key: "guidebooks", href: "/guidebooks", icon: BookOpen },
  { key: "notifications", href: "/notifications", icon: Bell },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

/**
 * One-time release notes. Held back while the onboarding tour is running —
 * new colleagues get the tour first; the changelog is for returning users.
 */
export function WhatsNewDialog() {
  const t = useTranslations("WhatsNew");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const { state: tourState } = useTour();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (prefs === undefined || !tourState) return;
    if (tourState.active) return;
    if (prefs?.dismissedWhatsNew === RELEASE_KEY) return;
    // Opens once when the async prefs/tour data resolves to "show it"; a
    // later dismiss() must not be overridden by this effect re-running.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [prefs, tourState]);

  function dismiss() {
    setOpen(false);
    void setPrefs({ dismissedWhatsNew: RELEASE_KEY });
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && dismiss()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {HIGHLIGHTS.map(({ key, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              onClick={dismiss}
              className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-2.5 transition-colors hover:bg-accent"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t(`items.${key}.title`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(`items.${key}.body`)}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={dismiss}>{t("dismiss")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
