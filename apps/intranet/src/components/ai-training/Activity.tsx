"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";

export function Activity() {
  const t = useTranslations("AiTraining.activity");
  const locale = useLocale();
  const rows = useQuery(api.aiTraining.access.activity);
  if (rows === undefined) return <Skeleton className="h-60" />;
  if (rows.length === 0) return <EmptyState icon={<History />} title={t("empty")} />;
  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((row) => (
        <li key={row._id} className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:gap-3">
          <span className="shrink-0 text-xs text-muted-foreground sm:w-36 sm:pt-0.5">
            {formatDateTime(row.at, locale)}
          </span>
          <div className="min-w-0">
            <span className="font-medium">{row.actorName}</span> {t(`action.${row.action}`)}{" "}
            {row.href ? (
              <Link href={row.href} className="underline underline-offset-2">
                {row.target}
              </Link>
            ) : (
              <span>„{row.target}“</span>
            )}
            {row.detail && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{row.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Trainers() {
  const t = useTranslations("AiTraining.people");
  const me = useQuery(api.aiTraining.access.me);
  const people = useQuery(api.aiTraining.access.trainers);
  const setTrainer = useMutation(api.aiTraining.access.setTrainer);
  if (people === undefined || me === undefined) return <Skeleton className="h-60" />;
  const shown = me.admin ? people : people.filter((p) => p.trainer);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{me.admin ? t("introAdmin") : t("intro")}</p>
      <ul className="divide-y rounded-xl border">
        {shown.map((person) => (
          <li
            key={person._id}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
          >
            <span>
              {person.name}
              {person.admin && (
                <span className="ml-2 text-xs text-muted-foreground">{t("admin")}</span>
              )}
            </span>
            {me.admin && (
              <Switch
                checked={person.trainer}
                disabled={person.admin}
                aria-label={t("toggle", { name: person.name })}
                onCheckedChange={(trainer) => void setTrainer({ userId: person._id, trainer })}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
