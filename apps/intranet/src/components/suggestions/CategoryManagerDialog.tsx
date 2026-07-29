"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { OrgEntityCrudList } from "@/components/admin/OrgEntityCrudList";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function CategoryManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin");
  const ts = useTranslations("Suggestions");
  const categories = useQuery(api.suggestionCategories.list, {});
  const createCategory = useMutation(api.suggestionCategories.create);
  const renameCategory = useMutation(api.suggestionCategories.rename);
  const archiveCategory = useMutation(api.suggestionCategories.archive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{ts("categoryManagerTitle")}</DialogTitle>
        <DialogDescription>{ts("categoryManagerDescription")}</DialogDescription>
        <OrgEntityCrudList
          entities={categories}
          createPlaceholder={t("orgEntity.suggestionCategoryNamePlaceholder")}
          onCreate={(name) => createCategory({ name }).then(() => {})}
          onRename={(categoryId, name) =>
            renameCategory({ categoryId: categoryId as Id<"suggestionCategories">, name }).then(
              () => {},
            )
          }
          onArchiveToggle={(categoryId, archived) =>
            archiveCategory({
              categoryId: categoryId as Id<"suggestionCategories">,
              archived,
            }).then(() => {})
          }
        />
      </DialogContent>
    </Dialog>
  );
}
