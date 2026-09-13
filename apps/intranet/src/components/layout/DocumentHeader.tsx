import type { ReactNode } from "react";

/**
 * The opening of a page someone reads: what kind of document it is, its
 * title at reading size, and a line saying what's inside. The shape
 * Anthropic's docs and news pages lead with — a document announces itself in
 * the page, not in a 15px title in the chrome.
 *
 * App pages that are operated rather than read use `PageHeader`, which puts
 * the title in the shared top bar instead.
 */
export function DocumentHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  /** The kind of document ("Guidebook", "Changelog") — context, not a title. */
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1.5 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-balance md:text-[2.125rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
