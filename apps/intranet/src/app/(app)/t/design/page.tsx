"use client";

import {
  CircleCheck,
  LayoutList,
  MousePointerClick,
  PanelsTopLeft,
  Save,
  Smartphone,
  TriangleAlert,
  CircleX,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Demo } from "@/components/playground/Demo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PRINCIPLES: { key: string; icon: LucideIcon }[] = [
  { key: "hairlines", icon: LayoutList },
  { key: "status", icon: CircleCheck },
  { key: "dialogs", icon: MousePointerClick },
  { key: "saves", icon: Save },
  { key: "tabs", icon: Smartphone },
  { key: "pages", icon: PanelsTopLeft },
];

const COLOR_GROUPS: { key: string; tokens: string[] }[] = [
  { key: "surfaces", tokens: ["background", "card", "panel-2", "muted", "accent", "border"] },
  { key: "text", tokens: ["foreground", "muted-foreground", "primary"] },
  { key: "status", tokens: ["ok", "warn", "danger", "info", "idle"] },
  { key: "charts", tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] },
];

const RADII = ["sm", "md", "lg", "xl", "xxl"] as const;

const TYPE_SCALE = [
  { key: "display", className: "text-xl font-semibold tracking-tight" },
  { key: "section", className: "text-sm font-semibold tracking-tight" },
  { key: "row", className: "text-[13.5px] font-medium" },
  { key: "body", className: "text-[13px] leading-relaxed text-muted-foreground" },
  {
    key: "eyebrow",
    className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
  },
  { key: "mono", className: "font-mono text-[12px] text-muted-foreground" },
];

export default function PlaygroundDesignPage() {
  const t = useTranslations("Playground");

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(t("design.colors.copied", { text })),
      () => undefined,
    );
  }

  return (
    <>
      <Demo
        title={t("design.principles.title")}
        description={t("design.principles.description")}
        className="p-0"
      >
        <ul className="divide-y divide-border/60">
          {PRINCIPLES.map(({ key, icon: Icon }) => (
            <li key={key} className="flex gap-3.5 px-5 py-4">
              <Icon className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">{t(`design.principles.${key}.title`)}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                  {t(`design.principles.${key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Demo>

      <Demo
        title={t("design.colors.title")}
        description={t("design.colors.description")}
        source="app/globals.css"
      >
        <div className="space-y-6">
          {COLOR_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`design.colors.groups.${group.key}`)}
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {group.tokens.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => copy(`bg-${token}`)}
                    className="group overflow-hidden rounded-lg border border-border/70 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <span
                      className="block h-14 border-b border-border/60"
                      style={{ background: `var(--color-${token})` }}
                    />
                    <span className="block px-2.5 py-2 font-mono text-[11.5px] text-muted-foreground group-hover:text-foreground">
                      {token}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Demo>

      <Demo title={t("design.status.title")} description={t("design.status.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ok">
              {t("design.status.do")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">
                <CircleCheck className="size-3" />
                {t("design.status.healthy")}
              </Badge>
              <Badge variant="warning">
                <TriangleAlert className="size-3" />
                {t("design.status.degraded")}
              </Badge>
              <Badge variant="destructive">
                <CircleX className="size-3" />
                {t("design.status.down")}
              </Badge>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-danger">
              {t("design.status.dont")}
            </p>
            <div className="flex gap-2">
              {["bg-ok", "bg-warn", "bg-danger"].map((dot) => (
                <span key={dot} className={cn("size-3 rounded-full", dot)} />
              ))}
            </div>
            <p className="text-[12.5px] text-muted-foreground">{t("design.status.dontWhy")}</p>
          </div>
        </div>
      </Demo>

      <Demo title={t("design.radius.title")} description={t("design.radius.description")}>
        <div className="flex flex-wrap items-end gap-4">
          {RADII.map((radius) => (
            <button
              key={radius}
              type="button"
              onClick={() => copy(`rounded-${radius}`)}
              className="flex flex-col items-center gap-2"
            >
              <span
                className="block size-16 border border-border bg-muted"
                style={{ borderRadius: `var(--radius-${radius})` }}
              />
              <span className="font-mono text-[11.5px] text-muted-foreground">{radius}</span>
            </button>
          ))}
        </div>
      </Demo>

      <Demo
        title={t("design.type.title")}
        description={t("design.type.description")}
        className="p-0"
      >
        <ul className="divide-y divide-border/60">
          {TYPE_SCALE.map(({ key, className }) => (
            <li key={key} className="flex items-baseline gap-4 px-5 py-3.5">
              <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground/80">
                {key}
              </span>
              <span className={cn("min-w-0 truncate", className)}>
                {t(`design.type.samples.${key}`)}
              </span>
            </li>
          ))}
        </ul>
      </Demo>
    </>
  );
}
