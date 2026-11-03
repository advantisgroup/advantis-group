"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { ArrowLeft, ExternalLink, Loader2, Lock } from "lucide-react";

import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { findPraesentation } from "@/content/praesentationen";

/**
 * Präsentation aus dem Wiki, nur für Admins (03.11.2026). Zeigt die
 * eigenständige HTML-Seite eingebettet; „Vollbild im neuen Tab“ öffnet sie
 * ohne Intranet-Rahmen zum Präsentieren. /praesentationen steht bewusst
 * nicht in OPEN_PREFIXES (lib/maintenance.ts).
 */
export default function PraesentationPage() {
  const params = useParams<{ slug: string }>();
  const isAdmin = useIsAdmin();
  const praesentation = findPraesentation(params.slug);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !praesentation) return;
    let cancelled = false;
    void praesentation.load().then((text) => {
      if (!cancelled) setHtml(text);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, praesentation]);

  function openInNewTab() {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (!isAdmin || !praesentation) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Lock className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {praesentation
            ? "Diese Präsentation ist nur für Admins sichtbar."
            : "Präsentation nicht gefunden."}
        </p>
        <Link href="/guidebooks" className="mt-4 inline-block text-sm text-primary">
          Zurück zum Wiki
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/guidebooks"
            aria-label="Zurück zum Wiki"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{praesentation.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {praesentation.subtitle} · nur für Admins
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openInNewTab} disabled={!html}>
          <ExternalLink className="size-4" />
          Vollbild im neuen Tab
        </Button>
      </div>
      {html ? (
        <iframe
          srcDoc={html}
          title={praesentation.title}
          allow="fullscreen; clipboard-write"
          allowFullScreen
          className="min-h-0 w-full flex-1 rounded-lg border border-border bg-white"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
