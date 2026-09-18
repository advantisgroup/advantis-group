"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

type Category = { _id: Id<"itTicketCategories">; name: string };

export function CategoriesDialog({
  open,
  onOpenChange,
  categories,
  tickets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  /** Used only to warn how many tickets a category-to-delete is used by. */
  tickets: Doc<"itTickets">[] | undefined;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const createCategory = useMutation(api.itTickets.tickets.createCategory);
  const removeCategory = useMutation(api.itTickets.tickets.removeCategory);
  const handleError = useErrorHandler();
  const [name, setName] = useState("");

  function addCategory() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("categoryNameRequired"));
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(t("categoryExists"));
      return;
    }
    createCategory({ name: trimmed })
      .then(() => {
        toast.success(t("categoryCreated"));
        setName("");
      })
      .catch(handleError);
  }

  async function deleteCategory(category: Category) {
    const usedBy = (tickets ?? []).filter((tk) => tk.category === category.name).length;
    const confirmed = await confirm({
      title: t("categoriesTitle"),
      description:
        usedBy > 0
          ? t("deleteCategoryConfirm", { name: category.name, count: usedBy })
          : t("deleteCategorySimpleConfirm", { name: category.name }),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    removeCategory({ categoryId: category._id })
      .then(() => toast.success(t("categoryDeleted")))
      .catch(handleError);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("categoriesTitle")}
      description={t("categoriesDescription")}
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {tc("close")}
        </Button>
      }
    >
      <div className="max-h-72 space-y-0 overflow-y-auto">
        {categories.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">{t("noCategories")}</p>
        )}
        {categories.map((category) => (
          <div
            key={category._id}
            className="flex items-center justify-between border-b border-border/70 py-2 text-sm last:border-b-0"
          >
            <span>{category.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => deleteCategory(category)}
            >
              {tc("delete")}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("newCategoryPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCategory();
          }}
        />
        <Button type="button" onClick={addCategory}>
          {t("addCategory")}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
