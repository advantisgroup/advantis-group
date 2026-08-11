import { HelpCircle, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { type TabNavigationProps } from "@/types/contact";

export function TabNavigation({ contactMode, onModeChange }: TabNavigationProps) {
  const t = useTranslations("contact.tabs");

  return (
    <div className="border-b border-border bg-muted/30">
      <div className="flex">
        <button
          onClick={() => onModeChange("message")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative",
            contactMode === "message"
              ? "text-foreground bg-card"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">{t("writeMessage")}</span>
          <span className="sm:hidden">{t("writeMessageShort")}</span>
          {contactMode === "message" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => onModeChange("callback")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative border-l border-border",
            contactMode === "callback"
              ? "text-foreground bg-card"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <Phone className="w-4 h-4" />
          <span className="hidden sm:inline">{t("requestCallback")}</span>
          <span className="sm:hidden">{t("requestCallbackShort")}</span>
          {contactMode === "callback" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => onModeChange("other")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative border-l border-border",
            contactMode === "other"
              ? "text-foreground bg-card"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{t("otherInquiries")}</span>
          <span className="sm:hidden">{t("otherInquiriesShort")}</span>
          {contactMode === "other" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>
    </div>
  );
}
