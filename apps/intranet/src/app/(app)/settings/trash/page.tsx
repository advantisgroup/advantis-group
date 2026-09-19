"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

type TrashItem = NonNullable<ReturnType<typeof useQuery<typeof api.org.trash.list>>>[number];

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function SettingsTrashPage() {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const items = useQuery(api.org.trash.list);
  const restore = useMutation(api.org.trash.restore);
  const handleError = useErrorHandler();
  const [restoring, setRestoring] = useState<string | null>(null);

  async function onRestore(item: TrashItem) {
    setRestoring(item.id);
    try {
      await restore({ table: item.table, id: item.id });
      toast.success(t("trashRestored", { label: item.label }));
    } catch (error) {
      handleError(error);
    } finally {
      setRestoring(null);
    }
  }

  if (items === undefined) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<Trash2 />} title={t("trashEmpty")} description={t("trashEmptyHint")} />
    );
  }

  return (
    <SettingsSection title={t("trash")} description={t("trashSectionHint")}>
      {items.map((item) => (
        <SettingsRow
          key={item.id}
          title={item.label}
          description={[
            t(`trashTypes.${item.table}`),
            item.deletedByName
              ? t("trashDeletedBy", {
                  date: formatIsoDate(day(item.deletedAt), locale),
                  name: item.deletedByName,
                })
              : formatIsoDate(day(item.deletedAt), locale),
            t("trashGoneOn", { date: formatIsoDate(day(item.purgesAt), locale) }),
          ].join(" · ")}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={restoring === item.id}
              onClick={() => void onRestore(item)}
            >
              <RotateCcw />
              {t("trashRestore")}
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}
