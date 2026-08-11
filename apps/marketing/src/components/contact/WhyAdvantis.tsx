import { useTranslations } from "next-intl";

import { type WhyAdvantisSidebarProps } from "@/types/contact";

export function WhyAdvantisSidebar({ contactMode }: WhyAdvantisSidebarProps) {
  const t = useTranslations("contact.sidebar");

  const getDescription = () => {
    switch (contactMode) {
      case "message":
        return t("descriptionMessage");
      case "callback":
        return t("descriptionCallback");
      case "other":
        return t("descriptionOther");
      default:
        return t("descriptionMessage");
    }
  };

  const getClosing = () => {
    switch (contactMode) {
      case "message":
        return t("closingMessage");
      case "callback":
        return t("closingCallback");
      case "other":
        return t("closingOther");
      default:
        return t("closingMessage");
    }
  };

  return (
    <aside className="flex h-full flex-col justify-between bg-muted/20 p-6 md:p-8">
      <div className="space-y-5">
        <h3 className="text-xl font-semibold text-foreground md:text-2xl">
          {t("title")} ADVANTIS GROUP?
        </h3>
        <p className="text-base leading-7 text-muted-foreground">{t("description1")}</p>
        <p className="text-base leading-7 text-muted-foreground">{getDescription()}</p>
      </div>

      <div className="mt-8 border-t border-border/70 pt-5">
        <p className="text-sm leading-6 text-muted-foreground">{getClosing()}</p>
      </div>
    </aside>
  );
}
