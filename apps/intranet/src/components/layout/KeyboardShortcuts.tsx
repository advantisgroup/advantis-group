"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GO_TO = {
  h: "/",
  c: "/chat",
  t: "/it-tickets",
  a: "/announcements",
  w: "/guidebooks",
  k: "/calendar",
} as const;

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function visible(el: Element) {
  return el instanceof HTMLElement && el.offsetParent !== null && !el.closest("[role=dialog]");
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-6 rounded-md border border-border/80 bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function KeyboardShortcuts() {
  const t = useTranslations("Common.shortcuts");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const goPending = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]") && e.key !== "?") return;

      if (goPending.current > Date.now()) {
        goPending.current = 0;
        const href = GO_TO[e.key as keyof typeof GO_TO];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      switch (e.key) {
        case "?":
          e.preventDefault();
          setOpen((o) => !o);
          return;
        case "g":
          goPending.current = Date.now() + 1200;
          return;
        case "n": {
          const button = [...document.querySelectorAll("[data-shortcut-new]")].find(visible);
          if (button instanceof HTMLElement) {
            e.preventDefault();
            button.click();
          }
          return;
        }
        case "/": {
          // pages with their own "/" handler already took it
          setTimeout(() => {
            if (e.defaultPrevented) return;
            const input = [
              ...document.querySelectorAll<HTMLInputElement>(
                "main input[type=search], main input[placeholder]:not([type=hidden])",
              ),
            ].find(visible);
            input?.focus();
            input?.select();
          });
          return;
        }
        case "j":
        case "k": {
          const items = [
            ...document.querySelectorAll<HTMLElement>("main [data-shortcut-item]"),
          ].filter(visible);
          if (items.length === 0) return;
          e.preventDefault();
          const current = items.indexOf(document.activeElement as HTMLElement);
          const next =
            current === -1
              ? e.key === "j"
                ? 0
                : items.length - 1
              : Math.min(items.length - 1, Math.max(0, current + (e.key === "j" ? 1 : -1)));
          items[next].focus();
          items[next].scrollIntoView({ block: "nearest" });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const groups: { title: string; rows: { label: string; keys: string[] }[] }[] = [
    {
      title: t("general"),
      rows: [
        { label: t("palette"), keys: ["Ctrl", "K"] },
        { label: t("search"), keys: ["/"] },
        { label: t("new"), keys: ["N"] },
        { label: t("nextItem"), keys: ["J"] },
        { label: t("previousItem"), keys: ["K"] },
        { label: t("help"), keys: ["?"] },
      ],
    },
    {
      title: t("goTo"),
      rows: [
        { label: t("goHome"), keys: ["G", "H"] },
        { label: t("goChat"), keys: ["G", "C"] },
        { label: t("goTickets"), keys: ["G", "T"] },
        { label: t("goAnnouncements"), keys: ["G", "A"] },
        { label: t("goWiki"), keys: ["G", "W"] },
        { label: t("goCalendar"), keys: ["G", "K"] },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</h3>
              <ul className="space-y-2">
                {group.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{row.label}</span>
                    <Keys keys={row.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
