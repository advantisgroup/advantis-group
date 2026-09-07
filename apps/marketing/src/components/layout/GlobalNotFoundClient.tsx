"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ArrowLeft, Mail } from "lucide-react";

import { Display, PageField } from "@/components/frame";
import { Button } from "@/components/ui/button";

/**
 * Next.js's `global-not-found.tsx` catches routes the `[locale]` tree never
 * sees, so this renders completely outside that layout — no next-intl
 * provider, no localized `Link`, no theme provider. Plain `next/link` and
 * English copy are deliberate, not an oversight; a real i18n setup here
 * would mean duplicating the message-loading machinery for a page almost
 * nobody spends more than a few seconds on.
 */
export default function GlobalNotFoundClient() {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      <PageField />

      <div className="relative mx-auto w-full max-w-lg px-5 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">
          ADVANTIS GROUP
        </span>

        <Display as="h1" size="xl" className="mt-6">
          404
        </Display>

        <p className="mt-4 text-lg text-muted-foreground">
          This page doesn&apos;t exist, or it moved somewhere we haven&apos;t linked yet.
        </p>

        {pathname ? (
          <div className="mt-6 inline-flex items-center rounded-lg border border-rule bg-card/40 px-4 py-2">
            <code className="break-all font-mono text-sm text-muted-foreground">{pathname}</code>
          </div>
        ) : null}

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-lg">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to homepage
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-lg border-rule-strong">
            <Link href="/contact">
              <Mail className="size-4" />
              Contact us
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
