"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useMutation, useQuery } from "convex/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BookOpen,
  Calendar,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Plane,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  group: string;
  label: string;
  sublabel?: string;
  icon?: typeof Search;
  avatar?: { src?: string | null; name: string; email?: string };
  run: () => void;
}

export function CommandPalette() {
  const t = useTranslations("Command");
  const tNav = useTranslations("Nav");
  const tGuide = useTranslations("Guidebooks");
  const router = useRouter();
  const isManager = useIsManager();
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);

  const people = useQuery(
    api.users.list,
    open && query.trim() ? { search: query.trim() } : "skip"
  );
  const announcements = useQuery(api.announcements.list, open ? {} : "skip");

  // ⌘K / Ctrl-K toggles the palette from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus once the dialog has mounted.
      const id = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function openDm(userId: Id<"users">) {
    setOpen(false);
    const { conversationId } = await getOrCreateDm({ otherUserId: userId });
    router.push(`/chat?c=${conversationId}`);
  }

  const pages = useMemo(() => {
    const all = [
      { href: "/", label: tNav("dashboard"), icon: LayoutDashboard },
      { href: "/calendar", label: tNav("calendar"), icon: Calendar },
      { href: "/absences", label: tNav("absences"), icon: Plane },
      {
        href: "/announcements",
        label: tNav("announcements"),
        icon: Megaphone,
      },
      { href: "/chat", label: tNav("chat"), icon: MessageSquare },
      {
        href: "/guidebooks",
        label: tNav("guidebooks"),
        icon: BookOpen,
        hidden: guidebooks.length === 0,
      },
      { href: "/directory", label: tNav("directory"), icon: Users },
      {
        href: "/admin",
        label: tNav("admin"),
        icon: ShieldCheck,
        managerOnly: true,
      },
      { href: "/settings", label: tNav("settings"), icon: Settings },
    ];
    return all.filter(p => !p.managerOnly || isManager).filter(p => !p.hidden);
  }, [tNav, isManager, guidebooks.length]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Item[] = [];

    for (const p of pages) {
      if (!q || p.label.toLowerCase().includes(q)) {
        list.push({
          id: `page:${p.href}`,
          group: t("pages"),
          label: p.label,
          icon: p.icon,
          run: () => go(p.href),
        });
      }
    }

    for (const gb of guidebooks) {
      const title = tGuide(gb.titleKey);
      if (!q || title.toLowerCase().includes(q)) {
        list.push({
          id: `gb:${gb.slug}`,
          group: t("guidebooks"),
          label: title,
          icon: gb.icon,
          run: () => go(`/guidebooks/${gb.slug}`),
        });
      }
    }

    if (q) {
      for (const u of people ?? []) {
        list.push({
          id: `user:${u._id}`,
          group: t("people"),
          label: u.name,
          sublabel: u.jobTitle || u.department || u.email,
          avatar: { src: u.avatar, name: u.name, email: u.email },
          run: () => void openDm(u._id),
        });
      }
      for (const a of announcements ?? []) {
        if (a.title.toLowerCase().includes(q)) {
          list.push({
            id: `ann:${a._id}`,
            group: t("announcements"),
            label: a.title,
            sublabel: a.authorName,
            icon: Megaphone,
            run: () => go("/announcements"),
          });
        }
      }
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, people, announcements, pages, guidebooks, t, tGuide]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return [...map.entries()];
  }, [items]);

  function onInputKey(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  }

  let flatIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-9 md:max-w-md md:px-3"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{t("placeholder")}</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-2xl shadow-black/30 duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="sr-only">
              {t("hint")}
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2.5 border-b border-border/70 px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={t("placeholder")}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {items.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  {t("noResults")}
                </p>
              ) : (
                groups.map(([group, groupItems]) => (
                  <div key={group} className="mb-1">
                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </p>
                    {groupItems.map(it => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      const Icon = it.icon;
                      return (
                        <button
                          key={it.id}
                          onClick={it.run}
                          onMouseMove={() => setActive(idx)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                            active === idx
                              ? "bg-accent text-foreground"
                              : "text-foreground/90 hover:bg-accent/60"
                          )}
                        >
                          {it.avatar ? (
                            <Avatar className="size-7 shrink-0">
                              {it.avatar.src && (
                                <AvatarImage
                                  src={it.avatar.src}
                                  alt={it.avatar.name}
                                />
                              )}
                              <AvatarFallback className="text-[10px]">
                                {initials(it.avatar.name, it.avatar.email)}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              {Icon && <Icon className="size-4" />}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {it.label}
                            </span>
                            {it.sublabel && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {it.sublabel}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
