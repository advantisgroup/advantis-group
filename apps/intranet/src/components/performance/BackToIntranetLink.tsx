"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

/** Performance runs its own header, entirely outside the intranet's sidebar
 * (see performance/layout.tsx's comment) — signing out was previously the
 * only way back to the rest of the intranet. This is a plain nav link back
 * to the intranet's home, shown in every Performance page's header
 * regardless of auth method (unlike "Exit", which only makes sense for a
 * real password session). */
export function BackToIntranetLink() {
  const t = useTranslations("Performance");
  return (
    <Link href="/">
      <Button variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("backToIntranet")}
      </Button>
    </Link>
  );
}
