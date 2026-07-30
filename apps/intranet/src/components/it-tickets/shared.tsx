import { type Doc } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

export type Ticket = Doc<"itTickets">;
export type Status = Ticket["status"];

export const STATUS_LABEL_KEY: Record<
  Status,
  "statusOffen" | "statusBearbeitung" | "statusClosed"
> = {
  offen: "statusOffen",
  bearbeitung: "statusBearbeitung",
  closed: "statusClosed",
};

export const STATUS_BORDER: Record<Status, string> = {
  offen: "border-l-amber-500",
  bearbeitung: "border-l-blue-600",
  closed: "border-l-emerald-600",
};

export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("ItTickets");
  if (status === "bearbeitung") {
    return (
      <Badge className="border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400">
        {t(STATUS_LABEL_KEY[status])}
      </Badge>
    );
  }
  return (
    <Badge variant={status === "offen" ? "warning" : "success"}>
      {t(STATUS_LABEL_KEY[status])}
    </Badge>
  );
}
