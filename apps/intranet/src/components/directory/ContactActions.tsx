"use client";

import { Copy, Mail, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Email / phone / message, as actual affordances.
 *
 * The old card fetched `phone` and never rendered it, and only showed `email`
 * as a fallback where the name should have been — so the one thing a directory
 * exists for (reaching someone) took a detour through the profile dialog. These
 * are the row/card-level shortcuts.
 */
export function ContactActions({
  email,
  phone,
  onMessage,
  className,
}: {
  email: string;
  phone?: string | null;
  onMessage?: () => void;
  className?: string;
}) {
  const t = useTranslations("Directory");

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={`mailto:${email}`} aria-label={t("sendEmail")}>
              <Mail />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{email}</TooltipContent>
      </Tooltip>

      {phone && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={`tel:${phone.replace(/\s+/g, "")}`} aria-label={t("call")}>
                <Phone />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{phone}</TooltipContent>
        </Tooltip>
      )}

      {onMessage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onMessage} aria-label={t("startChat")}>
              <MessageSquare />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("startChat")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Inline copyable text — the email line on a card. */
export function CopyableText({ value, className }: { value: string; className?: string }) {
  const t = useTranslations("Directory");

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => toast.success(t("copied")));
      }}
      className={cn(
        "group/copy flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-100" />
    </button>
  );
}
