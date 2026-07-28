"use client";

import { type Role } from "@advantis/types";
import { useTranslations } from "next-intl";

import { ROLE_ICONS } from "@/lib/permission-icons";
import { cn } from "@/lib/utils";

const ALL_ROLES: readonly Role[] = ["employee", "manager", "admin"];

/**
 * Segmented role picker — a row of pills rather than a `<Select>`, with the
 * selected role's description always shown underneath (not hidden behind a
 * hover-only tooltip), so what each tier grants is visible at a glance.
 */
export function RoleSelect({
  value,
  onChange,
  canElevate,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  canElevate: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("Roles");
  const options = canElevate ? ALL_ROLES : (["employee"] as const);

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div
        role="radiogroup"
        aria-label={t("label")}
        className="inline-flex rounded-lg border border-border/70 bg-muted/50 p-0.5"
      >
        {options.map((role) => {
          const Icon = ROLE_ICONS[role];
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={value === role}
              disabled={disabled}
              onClick={() => onChange(role)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
                value === role
                  ? "bg-card text-fg shadow-sm"
                  : "text-muted-foreground hover:text-fg",
              )}
            >
              <Icon className="size-3.5" />
              {t(role)}
            </button>
          );
        })}
      </div>
      <p className="max-w-52 text-[11px] leading-tight text-muted-foreground">
        {t(`${value}_desc`)}
      </p>
    </div>
  );
}
