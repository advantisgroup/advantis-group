"use client";

import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copies an absolute, shareable URL for `href` to the clipboard. */
export function CopyLinkButton({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const t = useTranslations("Applicants");

  async function copy() {
    const url = `${window.location.origin}${href}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("linkCopyFailed"));
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => void copy()}
    >
      <Link2 className="size-4" />
      {t("copyLink")}
    </Button>
  );
}
