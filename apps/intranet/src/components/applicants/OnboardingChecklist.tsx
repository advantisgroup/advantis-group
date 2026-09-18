"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Check, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  key?: string;
  label?: string;
  doneAt?: number;
}

const DEFAULT_KEYS = ["contract", "account", "clockodo", "equipment", "welcome", "training"];

export function OnboardingChecklist({
  employeeProfileId,
  items,
}: {
  employeeProfileId: Id<"employeeProfiles">;
  items: Item[] | undefined;
}) {
  const t = useTranslations("Applicants");
  const handleError = useErrorHandler();
  const setOnboarding = useMutation(api.hr.employees.setOnboarding);
  const [draft, setDraft] = useState("");

  const list: Item[] = items ?? DEFAULT_KEYS.map((key) => ({ id: key, key }));
  const done = list.filter((item) => item.doneAt).length;

  function save(next: Item[]) {
    setOnboarding({ employeeProfileId, items: next }).catch(handleError);
  }

  function addItem() {
    const label = draft.trim();
    if (!label) return;
    save([...list, { id: `${Date.now().toString(36)}`, label }]);
    setDraft("");
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-2">
      <div className="px-3 pb-2 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{t("onboardingTitle")}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("onboardingProgress", { done, total: list.length })}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-[width]"
            style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      <ul>
        {list.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded-lg px-3 py-1.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!item.doneAt}
              onClick={() =>
                save(
                  list.map((other) =>
                    other.id === item.id
                      ? { ...other, doneAt: other.doneAt ? undefined : Date.now() }
                      : other,
                  ),
                )
              }
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-sm"
            >
              <span
                className={cn(
                  "grid size-4.5 shrink-0 place-items-center rounded-full border transition-colors",
                  item.doneAt
                    ? "border-success bg-success text-white"
                    : "border-border group-hover:border-foreground/40",
                )}
              >
                {item.doneAt && <Check className="size-3" />}
              </span>
              <span className={cn("truncate", item.doneAt && "text-muted-foreground line-through")}>
                {item.key ? t(`onboarding_${item.key}`) : item.label}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("onboardingRemove")}
              onClick={() => save(list.filter((other) => other.id !== item.id))}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 px-3 pb-2 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <Plus className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("onboardingAdd")}
          className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </form>
    </section>
  );
}
