"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { forgetCurrentVisit } from "@/lib/nav-history";
import { cn } from "@/lib/utils";

/**
 * Back arrow in the sticky top bar, so "back" is reachable on every page
 * without scrolling up to a page's own back link. Only shown once this tab
 * has an in-app page to return to (see lib/nav-history), so it never sends
 * someone out of the intranet on a fresh tab or deep link.
 */
export function HeaderBackButton({ show, className }: { show: boolean; className?: string }) {
  const router = useRouter();
  if (!show) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("shrink-0", className)}
      onClick={() => {
        forgetCurrentVisit();
        router.back();
      }}
      aria-label="Zurück"
      title="Zurück"
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
}
