"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { Building2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials, roleLabel } from "@/lib/format";

/**
 * A compact "hover card"-style profile shown when clicking an @mention
 * inside rendered rich text — deliberately lighter than the full
 * `UserProfile` dialog/drawer (avatar, role, department, email, and a link
 * out to the full profile for anyone who wants more).
 */
export function MentionCard({
  userId,
  rect,
  onClose,
  onViewFullProfile,
}: {
  userId: Id<"users">;
  rect: DOMRect;
  onClose: () => void;
  onViewFullProfile: () => void;
}) {
  const t = useTranslations("Profile");
  const tRoles = useTranslations("Roles");
  const user = useQuery(api.users.get, { userId });
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Content height varies (loading state vs. loaded profile), so measure the
  // rendered card and clamp/flip it to stay inside the viewport rather than
  // letting it run off the bottom of the screen on small mobile viewports.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    setCardHeight(el.getBoundingClientRect().height);
  }, [user]);

  const cardWidth = 288;
  const margin = 12;
  const left =
    typeof window === "undefined"
      ? rect.left
      : Math.min(rect.left, window.innerWidth - cardWidth - margin);

  let top = rect.bottom + 8;
  if (typeof window !== "undefined" && cardHeight > 0) {
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    if (spaceBelow < cardHeight && rect.top - margin > cardHeight) {
      top = rect.top - cardHeight - 8;
    } else {
      top = Math.min(top, window.innerHeight - cardHeight - margin);
    }
  }

  return (
    <>
      {/* Backdrop: click-outside-to-close, no visible dimming since this is a
          lightweight hover card rather than a modal. */}
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={user?.name ?? t("title")}
        className="fixed z-50 max-h-[calc(100dvh-24px)] overflow-y-auto rounded-xl border border-border/70 bg-popover p-3.5 shadow-overlay"
        style={{ top, left, width: cardWidth }}
      >
        {user === undefined ? (
          <p className="py-3 text-center text-xs text-muted-foreground">…</p>
        ) : user === null ? (
          <p className="py-3 text-center text-xs text-muted-foreground">{t("notFound")}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-11 shrink-0">
                {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <Badge variant="muted" className="mt-1 font-normal">
                  {roleLabel(user, tRoles)}
                </Badge>
              </div>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {user.jobTitle && <p className="truncate">{user.jobTitle}</p>}
              {user.department && (
                <p className="flex items-center gap-1.5 truncate">
                  <Building2 className="size-3.5 shrink-0" />
                  {user.department}
                </p>
              )}
              <p className="flex items-center gap-1.5 truncate">
                <Mail className="size-3.5 shrink-0" />
                {user.email}
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onViewFullProfile}>
              {t("viewFullProfile")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
