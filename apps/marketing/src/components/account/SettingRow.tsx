import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One line of a settings page: what it is, a sentence on what it does, and
 * the control on the right. Rows save as they change, so there's no form
 * footer.
 */
export function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[15px] text-foreground">{label}</p>
        {description ? (
          <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
    </div>
  );
}

export function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 first:mt-10">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="mt-2 divide-y divide-rule border-y border-rule">{children}</div>
    </section>
  );
}
