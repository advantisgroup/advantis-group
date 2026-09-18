"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { OrgEntityCrudList } from "@/components/admin/OrgEntityCrudList";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

export function CategoryManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin");
  const ts = useTranslations("Suggestions");
  const categories = useQuery(api.suggestions.categories.list, {});
  const createCategory = useMutation(api.suggestions.categories.create);
  const renameCategory = useMutation(api.suggestions.categories.rename);
  const archiveCategory = useMutation(api.suggestions.categories.archive);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ts("categoryManagerTitle")}
      description={ts("categoryManagerDescription")}
      contentClassName="max-w-lg"
    >
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
    </ResponsiveDialog>
  );
}
