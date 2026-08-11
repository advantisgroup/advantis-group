"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useQuery } from "convex/react";
import { Eye } from "lucide-react";
import { Drawer } from "vaul";
import { useLocale, useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { useIsMobile } from "@/hooks/use-mobile";
import { type Announcement } from "@/lib/announcements";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Seen by" indicator — an avatar stack of recent readers instead of a bare
 *  count. Desktop keeps the click-to-open popover; mobile opens the same
 *  read/unread tabs as a bottom drawer (a floating popover is awkward to hit
 *  on a phone-width card) — a plain tap opens it either way, no long-press,
 *  since there's no competing "quick tap" action to protect here. */
export function ViewersSummary({
  announcementId,
  sample,
  count,
  total,
  canManage,
}: {
  announcementId: Id<"announcements">;
  sample: Announcement["viewerSample"];
  count: number;
  /** Audience size — shown as "x / y" to the author/admins only. */
  total?: number;
  /** Author/admin gets a second tab listing who hasn't read it yet. */
  canManage: boolean;
}) {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"read" | "unread">("read");

  const viewers = useQuery(
    api.announcements.viewers,
    open && tab === "read" ? { announcementId } : "skip",
  );
  const nonReaders = useQuery(
    api.announcements.nonReaders,
    open && canManage && tab === "unread" ? { announcementId } : "skip",
  );

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (!o) setTab("read");
  }

  const triggerContent = (
    <>
      {sample.length > 0 ? (
        <AvatarStack
          people={sample.map((v) => ({ id: v.userId, name: v.name, avatar: v.avatar }))}
          max={3}
          size="size-5"
          className="-space-x-1.5"
        />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
      <span className="tabular-nums">
        {total !== undefined ? t("readStats", { count, total }) : t("viewedBy", { count })}
      </span>
    </>
  );

  const panel = (
    <>
      {canManage && (
        <div className="mb-1 grid grid-cols-2 gap-1 px-0.5 pb-1">
          <button
            type="button"
            onClick={() => setTab("read")}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              tab === "read"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {t("viewedBy", { count })}
          </button>
          <button
            type="button"
            onClick={() => setTab("unread")}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              tab === "unread"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {t("notReadYet")}
          </button>
        </div>
      )}
      {!canManage && (
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("viewedBy", { count })}
        </p>
      )}
      {tab === "read" ? (
        viewers === undefined ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
        ) : viewers.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">{t("noViews")}</p>
        ) : (
          viewers.map((v) => (
            <div key={v.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Avatar className="size-6">
                {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
                <AvatarFallback className="text-[9px]">{initials(v.name)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-sm">{v.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatDateTime(v.readAt, locale)}
              </span>
            </div>
          ))
        )
      ) : nonReaders === undefined ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
      ) : nonReaders.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">{t("everyoneRead")}</p>
      ) : (
        nonReaders.map((v) => (
          <div key={v.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Avatar className="size-6">
              {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
              <AvatarFallback className="text-[9px]">{initials(v.name)}</AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm">{v.name}</span>
          </div>
        ))
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => handleOpenChange(true)}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {triggerContent}
        </button>
        <Drawer.Root open={open} onOpenChange={handleOpenChange}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <Drawer.Content
              aria-label={t("viewedBy", { count })}
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
            >
              <Drawer.Title className="sr-only">{t("viewedBy", { count })}</Drawer.Title>
              <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                {panel}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </>
    );
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {triggerContent}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-80 w-64 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {panel}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
