import { HelpCircle, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ContactMode, type TabNavigationProps } from "@/types/contact";

const TAB_TRIGGER_CLASSNAME =
  "relative flex-1 gap-2 rounded-none border-l border-border px-4 py-4 text-sm font-medium first:border-l-0 md:px-6 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none [&[data-state=active]]:after:absolute [&[data-state=active]]:after:inset-x-0 [&[data-state=active]]:after:bottom-0 [&[data-state=active]]:after:h-0.5 [&[data-state=active]]:after:bg-primary";

export function TabNavigation({ contactMode, onModeChange }: TabNavigationProps) {
  const t = useTranslations("contact.tabs");

  return (
    <Tabs
      value={contactMode}
      onValueChange={(value) => onModeChange(value as ContactMode)}
      className="border-b border-border bg-muted/30"
    >
      <TabsList className="h-auto w-full justify-start rounded-none bg-transparent p-0">
        <TabsTrigger value="message" className={TAB_TRIGGER_CLASSNAME}>
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">{t("writeMessage")}</span>
          <span className="sm:hidden">{t("writeMessageShort")}</span>
        </TabsTrigger>
        <TabsTrigger value="callback" className={TAB_TRIGGER_CLASSNAME}>
          <Phone className="h-4 w-4" />
          <span className="hidden sm:inline">{t("requestCallback")}</span>
          <span className="sm:hidden">{t("requestCallbackShort")}</span>
        </TabsTrigger>
        <TabsTrigger value="other" className={TAB_TRIGGER_CLASSNAME}>
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">{t("otherInquiries")}</span>
          <span className="sm:hidden">{t("otherInquiriesShort")}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
