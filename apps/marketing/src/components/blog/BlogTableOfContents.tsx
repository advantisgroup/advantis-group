"use client";

import { useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { type BlogHeading } from "@/lib/blog-headings";

/**
 * Deliberately quiet — no card, no icons, no border. Just a thin column of
 * small links that tracks scroll position. Only worth showing once an
 * article actually has structure; a single heading isn't a "contents" list.
 */
export function BlogTableOfContents({ headings }: { headings: BlogHeading[] }) {
  const t = useTranslations("blog");
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (headings.length < 2) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    observerRef.current = observer;
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label={t("tableOfContents")} className="hidden 2xl:block">
      <div className="sticky top-28 space-y-2.5 transition-[top] duration-300 [[data-header-hidden]_&]:top-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
          {t("tableOfContents")}
        </p>
        <ul className="space-y-2 border-l border-rule text-sm">
          {headings.map((heading) => (
            <li key={heading.id} className={cn(heading.level === 3 && "pl-3")}>
              <a
                href={`#${heading.id}`}
                className={cn(
                  "-ml-px block truncate border-l pl-3 leading-snug transition-colors",
                  activeId === heading.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
