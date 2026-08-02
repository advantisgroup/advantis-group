"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { accessibleGuidebooks, guidebookTitle, type Guidebook } from "./registry";

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `gb-${base}` : `gb-section-${index}`;
}

/**
 * Generic table of contents: scans the rendered guidebook for h2/h3 headings
 * (assigning ids where missing) and floats a nav on wide screens. Works for
 * every guidebook without touching their content components; a
 * MutationObserver keeps it fresh for tab-based guidebooks that swap content.
 */
export function GuidebookToc({ containerId = "guidebook-content" }: { containerId?: string }) {
  const t = useTranslations("Guidebooks");
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    function scan() {
      const headings = Array.from(container!.querySelectorAll<HTMLElement>("h2, h3")).filter((h) =>
        h.textContent?.trim(),
      );
      headings.forEach((h, i) => {
        if (!h.id) h.id = slugify(h.textContent ?? "", i);
      });
      setEntries((prev) => {
        const next = headings.map((h) => ({
          id: h.id,
          text: h.textContent ?? "",
          level: h.tagName === "H3" ? 3 : 2,
        }));
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    }

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerId]);

  useEffect(() => {
    if (entries.length === 0) return;
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (visible) => {
        const hit = visible.find((v) => v.isIntersecting);
        if (hit) setActiveId(hit.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    headings.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [entries]);

  if (entries.length < 2) return null;

  return (
    <nav aria-label={t("toc")} className="fixed right-6 top-36 hidden w-72 print:hidden xl:block">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("toc")}
      </p>
      <ul className="space-y-1 border-l border-border text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(e.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={cn(
                // Wrap to a second line rather than truncating — a cut-off
                // heading is useless for navigating to it.
                "-ml-px block w-full border-l-2 py-0.5 text-left leading-snug transition-colors",
                e.level === 3 ? "pl-6" : "pl-3",
                activeId === e.id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {e.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Thin progress bar tracking how far the reader has scrolled the page. */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    function update() {
      const el = main as HTMLElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    }
    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    }
    update();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 print:hidden">
      <div
        className="h-full bg-primary transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

/** "Was this helpful?" — one revisable vote per user; managers see totals. */
export function FeedbackWidget({ slug }: { slug: string }) {
  const t = useTranslations("Guidebooks");
  const mine = useQuery(api.guidebookFeedback.getMine, { slug });
  const stats = useQuery(api.guidebookFeedback.stats, { slug });
  const set = useMutation(api.guidebookFeedback.set);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 print:hidden">
      <p className="text-sm font-medium">{mine ? t("feedbackThanks") : t("feedbackQuestion")}</p>
      <div className="flex items-center gap-1.5">
        <Button
          variant={mine?.helpful === true ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={t("feedbackYes")}
          onClick={() => void set({ slug, helpful: true })}
        >
          <ThumbsUp className={cn(mine?.helpful === true && "fill-success/30 text-success")} />
        </Button>
        <Button
          variant={mine?.helpful === false ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={t("feedbackNo")}
          onClick={() => void set({ slug, helpful: false })}
        >
          <ThumbsDown
            className={cn(mine?.helpful === false && "fill-destructive/20 text-destructive")}
          />
        </Button>
      </div>
      {stats && stats.total > 0 && (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {t("feedbackStats", { helpful: stats.helpful, total: stats.total })}
        </span>
      )}
    </div>
  );
}

/** Chips linking to the other guidebooks the reader can open. */
export function RelatedGuidebooks({ current }: { current: Guidebook }) {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const others = accessibleGuidebooks(user).filter((gb) => gb.slug !== current.slug);
  if (others.length === 0) return null;
  return (
    <div className="mt-6 print:hidden">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("related")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {others.map((gb) => {
          const Icon = gb.icon;
          return (
            <Link
              key={gb.slug}
              href={`/guidebooks/${gb.slug}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Icon className="size-3 text-primary" />
              {guidebookTitle(gb, t)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
