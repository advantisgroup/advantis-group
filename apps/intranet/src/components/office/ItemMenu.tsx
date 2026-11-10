"use client";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  History,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { type OfficeItem } from "./shared";

/** Per-item actions; anyone who may look gets the history, admins the rest. */
export function ItemMenu({
  item,
  canEdit,
  onEdit,
  onMove,
  onHistory,
}: {
  item: OfficeItem;
  canEdit: boolean;
  onEdit: () => void;
  onMove: () => void;
  onHistory: () => void;
}) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const move = useMutation(api.office.moveItem);
  const retire = useMutation(api.office.retireItem);
  const restore = useMutation(api.office.restoreItem);

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast.success(done);
    } catch (e) {
      handleError(e, t("error"));
    }
  }

  const history: ActionMenuItem = {
    key: "history",
    label: t("item.history"),
    icon: <History className="size-4" />,
    onSelect: onHistory,
  };
  const items: ActionMenuItem[] = !canEdit
    ? [history]
    : item.retiredAt
      ? [
          {
            key: "restore",
            label: t("item.restore"),
            icon: <ArchiveRestore className="size-4" />,
            onSelect: () => void run(() => restore({ itemId: item._id }), t("item.restored")),
          },
          history,
        ]
      : [
          {
            key: "edit",
            label: t("item.edit"),
            icon: <Pencil className="size-4" />,
            onSelect: onEdit,
          },
          {
            key: "move",
            label: t("item.move"),
            icon: <ArrowRightLeft className="size-4" />,
            onSelect: onMove,
          },
          ...(item.deskId
            ? [
                {
                  key: "storage",
                  label: t("item.toStorage"),
                  icon: <Archive className="size-4" />,
                  onSelect: () =>
                    void run(
                      () => move({ itemId: item._id, deskId: null }),
                      t("item.movedToStorage"),
                    ),
                },
              ]
            : []),
          history,
          { key: "sep", separator: true },
          {
            key: "retire",
            label: t("item.retire"),
            icon: <Trash2 className="size-4" />,
            destructive: true,
            onSelect: () => void run(() => retire({ itemId: item._id }), t("item.retired")),
          },
        ];

  return (
    <ActionMenu
      align="end"
      ariaLabel={item.name}
      items={items}
      trigger={
        <Button variant="ghost" size="icon" className="size-8 shrink-0">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    />
  );
}
