import { useTranslations } from "next-intl";

import { type WhyAdvantisSidebarProps } from "@/types/contact";

import { BrandText } from "../effects/BrandText";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

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
    <Card className="border-0 rounded-none">
      <CardHeader>
        <CardTitle className="text-xl md:text-2xl">
          {t("title")} <BrandText brand="advantis">Advantis Group</BrandText>?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription className="text-base">
          {t("description1")}
        </CardDescription>
        <CardDescription className="text-base">
          {getDescription()}
        </CardDescription>
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">{getClosing()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
