"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";

import Image from "next/image";

import {
  ExternalLink,
  Info,
  Lightbulb,
  TriangleAlert,
  ZoomIn,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Content model. Guidebook documents (converted from Word/OneDrive docs)
   describe themselves as typed blocks; the viewer below renders them as a
   readable article with a table of contents. Inline markup inside `text`,
   `steps` and `callout` bodies supports:
     **bold**            → emphasised text
     [[Strg]]            → keyboard key chip
     [label](https://…)  → external link
   ────────────────────────────────────────────────────────────────────────── */

export type DocBlock =
  | { kind: "subheading"; text: string }
  | { kind: "text"; body: string }
  | {
      kind: "image";
      src: string;
      alt: string;
      width: number;
      height: number;
      caption?: string;
    }
  | { kind: "steps"; items: string[] }
  | { kind: "callout"; tone: "info" | "warning" | "tip"; body: string }
  | { kind: "links"; items: { label: string; href: string }[] }
  | { kind: "shortcuts"; items: { action: string; keys: string[] }[] };

export interface DocSection {
  /** Anchor id, also used by the table of contents. */
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface DocContent {
  sections: DocSection[];
}

/* ── Inline markup ──────────────────────────────────────────────────────── */

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)\s]+\))/g;
const LINK_TOKEN = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 align-middle font-mono text-[11px] font-semibold leading-none text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

function renderInline(text: string): ReactNode {
  return text.split(INLINE_TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("[[") && part.endsWith("]]")) {
      return <Kbd key={i}>{part.slice(2, -2)}</Kbd>;
    }
    const link = LINK_TOKEN.exec(part);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

const CALLOUT_STYLES = {
  info: {
    container:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    Icon: Info,
  },
  warning: {
    container:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    Icon: TriangleAlert,
  },
  tip: {
    container:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    Icon: Lightbulb,
  },
} as const;

function DocImage({
  block,
}: {
  block: Extract<DocBlock, { kind: "image" }>;
}) {
  const t = useTranslations("Guidebooks");
  const [open, setOpen] = useState(false);

  return (
    <figure className="my-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("docViewer.zoomImage")}
        className="group relative inline-block max-w-full cursor-zoom-in rounded-xl border border-border bg-muted/40 p-2 transition-colors hover:border-primary/40"
      >
        <Image
          src={block.src}
          alt={block.alt}
          width={block.width}
          height={block.height}
          className="h-auto max-w-full rounded-lg"
        />
        <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
          <ZoomIn className="size-4" />
        </span>
      </button>
      {block.caption && (
        <figcaption className="mt-1.5 text-xs text-muted-foreground">
          {block.caption}
        </figcaption>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="w-auto max-w-[min(64rem,calc(100%-2rem))] gap-0 p-3"
        >
          <DialogTitle className="sr-only">{block.alt}</DialogTitle>
          <Image
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            sizes="90vw"
            className="h-auto w-full rounded-lg"
          />
          {block.caption && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {block.caption}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </figure>
  );
}

function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "subheading":
      return (
        <h3 className="mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <span className="h-4 w-1 rounded-full bg-primary" />
          {block.text}
        </h3>
      );
    case "text":
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {renderInline(block.body)}
        </p>
      );
    case "image":
      return <DocImage block={block} />;
    case "steps":
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {renderInline(item)}
              </span>
            </li>
          ))}
        </ol>
      );
    case "callout": {
      const style = CALLOUT_STYLES[block.tone];
      return (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed",
            style.container
          )}
        >
          <style.Icon className="mt-0.5 size-4 shrink-0" />
          <span>{renderInline(block.body)}</span>
        </div>
      );
    }
    case "links":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.items.map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              <span className="min-w-0 text-sm font-medium leading-snug">
                {link.label}
              </span>
            </a>
          ))}
        </div>
      );
    case "shortcuts":
      return (
        <div className="grid gap-x-8 sm:grid-cols-2">
          {block.items.map(item => (
            <div
              key={item.action}
              className="flex items-center justify-between gap-4 border-b border-border/60 py-2"
            >
              <span className="text-sm text-muted-foreground">
                {item.action}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {item.keys.map((key, i) => (
                  <Fragment key={i}>
                    {i > 0 && (
                      <span className="text-xs text-muted-foreground">+</span>
                    )}
                    <Kbd>{key}</Kbd>
                  </Fragment>
                ))}
              </span>
            </div>
          ))}
        </div>
      );
  }
}

/* ── Viewer ─────────────────────────────────────────────────────────────── */

export function DocViewer({ doc }: { doc: DocContent }) {
  const t = useTranslations("Guidebooks");
  const [activeId, setActiveId] = useState<string | null>(
    doc.sections[0]?.id ?? null
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -65% 0px" }
    );
    for (const section of doc.sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [doc]);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-10">
      {/* Mobile TOC: horizontal chip row */}
      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {doc.sections.map((section, i) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="font-mono text-[10px] font-bold text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            {section.title}
          </a>
        ))}
      </nav>

      {/* Article */}
      <article className="min-w-0 space-y-12 pb-12">
        {doc.sections.map((section, i) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <div className="mb-4 flex items-baseline gap-3 border-b border-border pb-3">
              <span className="font-mono text-sm font-bold text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-display text-xl font-bold tracking-tight">
                {section.title}
              </h2>
            </div>
            <div className="space-y-4">
              {section.blocks.map((block, j) => (
                <DocBlockView key={j} block={block} />
              ))}
            </div>
          </section>
        ))}
      </article>

      {/* Desktop TOC: sticky sidebar with scrollspy */}
      <nav className="hidden lg:block">
        <div className="sticky top-24">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("docViewer.onThisPage")}
          </p>
          <ul className="mt-3 space-y-0.5 border-l border-border">
            {doc.sections.map(section => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={cn(
                    "-ml-px block border-l-2 py-1 pl-3 text-sm leading-snug transition-colors",
                    activeId === section.id
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
