"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CalendarPlus,
  Clock,
  Compass,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Plane,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRoundSearch,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { toast } from "sonner";

import { useAsk } from "@/components/ai/ask-subject";
import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { useAiNavigate } from "@/components/ai/use-ai-navigate";
import { accessibleGuidebooks, guidebookTitle } from "@/components/guidebooks/registry";
import {
  useCurrentUser,
  useHasCapability,
  useHasApplicantAccess,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  group: string;
  label: string;
  sublabel?: string;
  icon?: typeof Search;
  avatar?: { src?: string | null; name: string; email?: string };
  /** Present when this item is a plain navigation — lets it be remembered
   * in "Recent" and replayed later without needing the original data (a
   * person or applicant fetched live may no longer be in scope). */
  href?: string;
  run: () => void;
}

const RECENT_KEY = "cmdk:recent";
const RECENT_LIMIT = 6;

interface RecentEntry {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(entry: RecentEntry) {
  try {
    const existing = loadRecent().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — recent items just won't persist.
  }
}

/** Bolds the first occurrence of `query` inside `label` so scanning a result
 * list is faster than reading every character. */
function HighlightMatch({ label, query }: { label: string; query: string }) {
  if (!query) return <>{label}</>;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{label}</>;
  return (
    <Fragment>
      {label.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 text-inherit">
        {label.slice(idx, idx + query.length)}
      </mark>
      {label.slice(idx + query.length)}
    </Fragment>
  );
}

/** Just a search icon in the header's tool cluster, so it never competes with
 *  a page's title and tabs for room. ⌘K opens it from anywhere. */
export function CommandPalette({ className }: { className?: string } = {}) {
  const t = useTranslations("Command");
  const tNav = useTranslations("Nav");
  const tGuide = useTranslations("Guidebooks");
  const router = useRouter();
  const isManager = useIsManager();
  const hasApplicantAccess = useHasApplicantAccess();
  const hasFilesAccess = useHasCapability("access_files");
  const hasClockodoTeamAccess = useHasCapability("view_clockodo_team");
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);
  const { ask, pageSubject } = useAsk();
  const aiEnabled = useAiEnabled();
  const navigateAi = useAiNavigate();
  const keyboardInset = useKeyboardInset();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement | null>());
  const openSourceRef = useRef<"keyboard" | "trigger" | "mobile-nav">("trigger");

  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);

  const people = useQuery(
    api.people.users.list,
    open && query.trim() ? { search: query.trim() } : "skip",
  );
  const announcements = useQuery(api.announcements.list, open && query.trim() ? {} : "skip");
  // A locked vault makes applicants.list throw, which would take the whole
  // palette down — only search applicants while it's unlocked.
  const vault = useQuery(api.hr.vault.status, open && hasApplicantAccess ? {} : "skip");
  const applicants = useQuery(
    api.hr.applicants.list,
    open && hasApplicantAccess && vault?.unlocked && query.trim() ? {} : "skip",
  );

  // ⌘K / Ctrl-K toggles the palette from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSourceRef.current = "keyboard";
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Allow other surfaces (e.g. the mobile bottom bar) to open the palette.
  useEffect(() => {
    const openFromEvent = () => {
      openSourceRef.current = "mobile-nav";
      setOpen(true);
    };
    window.addEventListener("command-palette:open", openFromEvent);
    return () => window.removeEventListener("command-palette:open", openFromEvent);
  }, []);

  // The dialog closes the moment "Ask AI to find…" is picked, so feedback
  // while it resolves (and a redirect, once it does) has to happen as toasts.
  useEffect(() => {
    if (!navigateAi.pending) return;
    const id = toast.loading(t("aiSearching"));
    return () => {
      toast.dismiss(id);
    };
  }, [navigateAi.pending, t]);
  useEffect(() => {
    if (navigateAi.notFound) toast.info(t("aiNoMatch"));
  }, [navigateAi.notFound, t]);
  useEffect(() => {
    if (navigateAi.failed) toast.error(t("aiSearchFailed"));
  }, [navigateAi.failed, t]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setRecent(loadRecent());
      posthog.capture("command_palette_opened", { source: openSourceRef.current });
      // Focus once the dialog has mounted.
      const id = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  function runItem(it: Item) {
    posthog.capture("command_palette_item_selected", {
      group: it.group,
      id: it.id,
      query_length: query.trim().length,
    });
    if (it.href) {
      saveRecent({ id: it.id, label: it.label, sublabel: it.sublabel, href: it.href });
    }
    it.run();
  }

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
      ...(user.clockodoUserId || hasClockodoTeamAccess
        ? [{ href: "/clockodo", label: tNav("absences"), icon: Plane }]
        : []),
      {
        href: "/announcements",
        label: tNav("announcements"),
        icon: Megaphone,
      },
      { href: "/chat", label: tNav("chat"), icon: MessageSquare },
      ...(hasFilesAccess ? [{ href: "/files", label: tNav("files"), icon: FolderOpen }] : []),
      {
        href: "/guidebooks",
        label: tNav("guidebooks"),
        icon: BookOpen,
        hidden: guidebooks.length === 0,
      },
      { href: "/directory", label: tNav("directory"), icon: Users },
      { href: "/suggestions", label: tNav("suggestions"), icon: Lightbulb },
      { href: "/it-tickets", label: tNav("itTickets"), icon: Wrench },
      { href: "/fehlermanagement", label: tNav("errorManagement"), icon: AlertTriangle },
      ...(hasApplicantAccess
        ? [{ href: "/hr", label: tNav("applicants"), icon: UserRoundSearch }]
        : []),
      {
        href: "/admin",
        label: tNav("admin"),
        icon: ShieldCheck,
        managerOnly: true,
      },
      { href: "/settings", label: tNav("settings"), icon: Settings },
      { href: "/t", label: tNav("playground"), icon: FlaskConical, searchOnly: true },
    ];
    return all.filter((p) => !p.managerOnly || isManager).filter((p) => !p.hidden);
  }, [
    tNav,
    isManager,
    hasApplicantAccess,
    hasClockodoTeamAccess,
    hasFilesAccess,
    guidebooks.length,
    user.clockodoUserId,
  ]);

  const actions = useMemo(
    () =>
      [
        {
          id: "new-event",
          label: t("actionNewEvent"),
          icon: CalendarPlus,
          href: "/calendar?new=1",
          managerOnly: true,
        },
        {
          id: "new-announcement",
          label: t("actionNewAnnouncement"),
          icon: Plus,
          href: "/announcements/new",
          managerOnly: true,
        },
        {
          id: "new-ticket",
          label: t("actionNewTicket"),
          icon: Wrench,
          href: "/it-tickets?new=1",
        },
        {
          id: "new-suggestion",
          label: t("actionNewSuggestion"),
          icon: Lightbulb,
          href: "/suggestions?new=1",
        },
        {
          id: "new-error",
          label: t("actionNewError"),
          icon: AlertTriangle,
          href: "/fehlermanagement?new=1",
        },
        {
          id: "upload-file",
          label: t("actionUpload"),
          icon: UploadCloud,
          href: "/files",
          filesOnly: true,
        },
      ].filter((a) => (!a.managerOnly || isManager) && (!a.filesOnly || hasFilesAccess)),
    [t, isManager, hasFilesAccess],
  );

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Item[] = [];

    // Asking about whatever the page has open — deliberately first, since it
    // acts on where you already are rather than sending you somewhere.
    const askItem: Item | null =
      aiEnabled && pageSubject
        ? {
            id: "ask-page",
            group: t("actions"),
            label: t("actionAsk", { subject: pageSubject.label }),
            icon: Sparkles,
            run: () => {
              setOpen(false);
              ask();
            },
          }
        : null;

    // Empty query: a quick-launch view (recent, then actions, then pages)
    // instead of an empty "type to search" screen — most opens are to jump
    // somewhere already known, not to search.
    if (!q) {
      if (askItem) list.push(askItem);
      for (const r of recent) {
        list.push({
          id: `recent:${r.id}`,
          group: t("recent"),
          label: r.label,
          sublabel: r.sublabel,
          icon: Clock,
          href: r.href,
          run: () => go(r.href),
        });
      }
      for (const a of actions) {
        list.push({
          id: `action:${a.id}`,
          group: t("actions"),
          label: a.label,
          icon: a.icon,
          href: a.href,
          run: () => go(a.href),
        });
      }
      for (const p of pages) {
        if (p.searchOnly) continue;
        list.push({
          id: `page:${p.href}`,
          group: t("pages"),
          label: p.label,
          icon: p.icon,
          href: p.href,
          run: () => go(p.href),
        });
      }
      return list;
    }

    if (askItem?.label.toLowerCase().includes(q)) list.push(askItem);

    // A catch-all fallback for anything that didn't match a page, person or
    // record below — lets the same box that searches also just be asked.
    if (aiEnabled) {
      list.push({
        id: "ai-navigate",
        group: t("actions"),
        label: t("actionFind", { query: query.trim() }),
        icon: Compass,
        run: () => {
          const asked = query.trim();
          setOpen(false);
          void navigateAi.run(asked);
        },
      });
    }

    for (const a of actions) {
      if (a.label.toLowerCase().includes(q)) {
        list.push({
          id: `action:${a.id}`,
          group: t("actions"),
          label: a.label,
          icon: a.icon,
          href: a.href,
          run: () => go(a.href),
        });
      }
    }

    for (const p of pages) {
      if (p.label.toLowerCase().includes(q)) {
        list.push({
          id: `page:${p.href}`,
          group: t("pages"),
          label: p.label,
          icon: p.icon,
          href: p.href,
          run: () => go(p.href),
        });
      }
    }

    for (const gb of guidebooks) {
      const title = guidebookTitle(gb, tGuide);
      if (title.toLowerCase().includes(q)) {
        list.push({
          id: `gb:${gb.slug}`,
          group: t("guidebooks"),
          label: title,
          icon: gb.icon,
          href: `/guidebooks/${gb.slug}`,
          run: () => go(`/guidebooks/${gb.slug}`),
        });
      }
    }

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
    for (const a of (announcements ?? [])
      .filter((a) => a.title.toLowerCase().includes(q))
      .slice(0, 8)) {
      const href = `/announcements?id=${encodeURIComponent(a._id)}`;
      list.push({
        id: `ann:${a._id}`,
        group: t("announcements"),
        label: a.title,
        sublabel: a.authorName,
        icon: Megaphone,
        href,
        run: () => go(href),
      });
    }
    if (hasApplicantAccess) {
      const matchingApplicants = (applicants ?? [])
        .filter((ap) =>
          [ap.name, ap.email, ap.position].filter(Boolean).join(" ").toLowerCase().includes(q),
        )
        .slice(0, 8);
      for (const ap of matchingApplicants) {
        const href = `/hr/${ap._id}/uebersicht`;
        list.push({
          id: `applicant:${ap._id}`,
          group: t("applicants"),
          label: ap.name,
          sublabel: ap.position || ap.email,
          icon: UserRoundSearch,
          href,
          run: () => go(href),
        });
      }
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    recent,
    actions,
    aiEnabled,
    pageSubject,
    ask,
    navigateAi,
    pages,
    people,
    announcements,
    applicants,
    hasApplicantAccess,
    guidebooks,
    t,
    tGuide,
  ]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current.get(active)?.scrollIntoView({ block: "nearest" });
  }, [active]);

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
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) runItem(it);
    }
  }

  let flatIndex = -1;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={t("placeholder")}
            onClick={() => {
              openSourceRef.current = "trigger";
              setOpen(true);
            }}
          >
            <Search className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          {t("placeholder")}
          <kbd className="rounded border border-border/60 px-1 text-[10px] font-medium">⌘K</kbd>
        </TooltipContent>
      </Tooltip>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[92vw] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border/70 bg-popover shadow-2xl shadow-black/30 duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            style={
              // top-[12vh] + max-h-[76vh] end 12vh above the bottom edge already;
              // an open keyboard eats into the layout viewport's bottom without
              // shrinking it, so without this the results list ends up hidden
              // behind the keyboard instead of shrinking to fit above it.
              keyboardInset ? { maxHeight: `calc(76vh - ${keyboardInset}px)` } : undefined
            }
          >
            <DialogPrimitive.Title className="sr-only">{t("hint")}</DialogPrimitive.Title>
            <div className="flex items-center gap-2.5 border-b border-border/70 px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={t("placeholder")}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label={t("clearSearch")}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                    {groupItems.map((it) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      const Icon = it.icon;
                      return (
                        <button
                          key={it.id}
                          ref={(el) => {
                            itemRefs.current.set(idx, el);
                          }}
                          onClick={() => runItem(it)}
                          onMouseMove={() => setActive(idx)}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                            active === idx
                              ? "bg-accent text-foreground"
                              : "text-foreground/90 hover:bg-accent/60",
                          )}
                        >
                          {it.avatar ? (
                            <Avatar className="size-7 shrink-0">
                              {it.avatar.src && (
                                <AvatarImage src={it.avatar.src} alt={it.avatar.name} />
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
                              <HighlightMatch label={it.label} query={query.trim()} />
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
            <div className="hidden shrink-0 items-center gap-3 border-t border-border/70 px-4 py-2 text-[11px] text-muted-foreground sm:flex">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium">
                  ↑
                </kbd>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium">
                  ↓
                </kbd>
                {t("navigate")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium">
                  ↵
                </kbd>
                {t("select")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium">
                  esc
                </kbd>
                {t("close")}
              </span>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
