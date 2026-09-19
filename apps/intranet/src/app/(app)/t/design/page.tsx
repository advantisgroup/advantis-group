"use client";

import { useState, type CSSProperties } from "react";

import {
  CircleCheck,
  RotateCcw,
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

import { Demo } from "@/components/playground/Demo";
import { Inspector, resolveStyle, styleOfClasses, toHex } from "@/components/playground/Inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

const ACCENTS = [
  { key: "brand", value: null, foreground: null },
  { key: "blue", value: "oklch(0.62 0.19 255)", foreground: "oklch(0.99 0 0)" },
  { key: "green", value: "oklch(0.64 0.16 150)", foreground: "oklch(0.99 0 0)" },
  { key: "violet", value: "oklch(0.6 0.22 295)", foreground: "oklch(0.99 0 0)" },
  { key: "amber", value: "oklch(0.8 0.16 80)", foreground: "oklch(0.22 0.02 80)" },
] as const;

const RADIUS_STEPS: [string, number][] = [
  ["sm", -4],
  ["md", -2],
  ["lg", 4],
  ["xl", 8],
  ["xxl", 16],
];

/** Overrides a few tokens on one box only, so the rest of the page stays put. */
function ThemeTuner() {
  const t = useTranslations("Playground");
  const [accent, setAccent] = useState<(typeof ACCENTS)[number]>(ACCENTS[0]);
  const [radius, setRadius] = useState<number | null>(null);

  const vars: Record<string, string> = {};
  if (accent.value) {
    vars["--primary"] = vars["--color-primary"] = accent.value;
    vars["--primary-foreground"] = vars["--color-primary-foreground"] = accent.foreground!;
  }
  if (radius !== null) {
    vars["--radius"] = `${radius}px`;
    for (const [name, offset] of RADIUS_STEPS) {
      vars[`--radius-${name}`] = `${Math.max(0, radius + offset)}px`;
    }
  }
  const css = Object.keys(vars).length
    ? Object.entries(vars)
        .filter(([name]) => !name.startsWith("--color-") && !/--radius-/.test(name))
        .map(([name, value]) => `${name}: ${value};`)
        .join("\n")
    : t("design.tuner.untouched");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {ACCENTS.map((a) => (
          <TogglePill key={a.key} active={accent.key === a.key} onClick={() => setAccent(a)}>
            <span
              className="size-2.5 rounded-full"
              style={{ background: a.value ?? "var(--color-primary)" }}
            />
            {t(`design.tuner.accents.${a.key}`)}
          </TogglePill>
        ))}
      </div>
      <label className="block max-w-sm space-y-1.5">
        <span className="flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted-foreground">{t("design.tuner.radius")}</span>
          <span className="font-mono tabular-nums">{radius ?? 12}px</span>
        </span>
        <input
          type="range"
          min={0}
          max={24}
          value={radius ?? 12}
          onChange={(event) => setRadius(Number(event.target.value))}
          className="w-full accent-primary"
        />
      </label>

      <div
        style={vars as CSSProperties}
        className="space-y-4 rounded-xl border border-border/70 bg-background p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">{t("design.tuner.primary")}</Button>
          <Button size="sm" variant="outline">
            {t("design.tuner.secondary")}
          </Button>
          <Badge>{t("design.tuner.badge")}</Badge>
          <Switch defaultChecked aria-label={t("design.tuner.badge")} />
        </div>
        <Input placeholder={t("design.tuner.input")} className="max-w-xs" />
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <p className="text-sm font-semibold">{t("design.tuner.cardTitle")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("design.tuner.cardBody")}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 rounded-full bg-primary" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <pre className="min-w-0 whitespace-pre-wrap rounded-md bg-muted px-2.5 py-1.5 font-mono text-[12px]">
          {css}
        </pre>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setAccent(ACCENTS[0]);
            setRadius(null);
          }}
        >
          <RotateCcw />
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}
function ColorGroup({ tokens }: { tokens: string[] }) {
  const t = useTranslations("Playground");
  return (
    <Inspector
      items={tokens}
      getKey={(token) => token}
      getLabel={(token) => token}
      gridClassName="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
      tileClassName="block w-full overflow-hidden rounded-lg border border-border/70 bg-card text-left"
      renderTile={(token) => (
        <>
          <span
            className="block h-14 border-b border-border/60"
            style={{ background: `var(--color-${token})` }}
          />
          <span className="block px-2.5 py-2 font-mono text-[11.5px] text-muted-foreground">
            {token}
          </span>
        </>
      )}
      renderFocus={(token) => (
        <>
          <span
            className="block h-32 border-b border-border/60"
            style={{ background: `var(--color-${token})` }}
          />
          <span className="block px-3 py-2.5 font-mono text-[12px]">{token}</span>
        </>
      )}
      getFields={(token) => {
        const value = resolveStyle("color", `var(--color-${token})`);
        const hex = toHex(value);
        return [
          { label: t("inspector.fields.background"), value: `bg-${token}` },
          { label: t("inspector.fields.text"), value: `text-${token}` },
          { label: t("inspector.fields.border"), value: `border-${token}` },
          { label: t("inspector.fields.variable"), value: `var(--color-${token})` },
          { label: t("inspector.fields.value"), value },
          {
            label: t("inspector.fields.hex"),
            value: hex,
            display: (
              <span className="inline-flex items-center gap-2">
                <span
                  className="size-3.5 rounded-sm border border-border/70"
                  style={{ background: hex }}
                />
                {hex}
              </span>
            ),
          },
        ];
      }}
    />
  );
}

export default function PlaygroundDesignPage() {
  const t = useTranslations("Playground");

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
              <ColorGroup tokens={group.tokens} />
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

      <Demo
        title={t("design.tuner.title")}
        description={t("design.tuner.description")}
        source="app/globals.css"
      >
        <ThemeTuner />
      </Demo>

      <Demo title={t("design.radius.title")} description={t("design.radius.description")}>
        <Inspector
          items={RADII}
          getKey={(radius) => radius}
          getLabel={(radius) => `rounded-${radius}`}
          gridClassName="flex flex-wrap items-end gap-3"
          tileClassName="rounded-lg p-2"
          renderTile={(radius) => (
            <span className="flex flex-col items-center gap-2">
              <span
                className="block size-16 border border-border bg-muted"
                style={{ borderRadius: `var(--radius-${radius})` }}
              />
              <span className="font-mono text-[11.5px] text-muted-foreground">{radius}</span>
            </span>
          )}
          renderFocus={(radius) => (
            <span className="grid place-items-center py-4">
              <span
                className="block size-32 border border-border bg-muted"
                style={{ borderRadius: `var(--radius-${radius})` }}
              />
            </span>
          )}
          getFields={(radius) => [
            { label: t("inspector.fields.class"), value: `rounded-${radius}` },
            { label: t("inspector.fields.variable"), value: `var(--radius-${radius})` },
            {
              label: t("inspector.fields.value"),
              value: resolveStyle("border-top-left-radius", `var(--radius-${radius})`),
            },
          ]}
        />
      </Demo>

      <Demo title={t("design.type.title")} description={t("design.type.description")}>
        <Inspector
          items={TYPE_SCALE}
          getKey={(entry) => entry.key}
          getLabel={(entry) => entry.key}
          gridClassName="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70"
          tileClassName="flex w-full items-baseline gap-4 bg-card px-4 py-3 text-left"
          renderTile={({ key, className }) => (
            <span className="flex min-w-0 items-baseline gap-4">
              <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground/80">
                {key}
              </span>
              <span className={cn("min-w-0 truncate", className)}>
                {t(`design.type.samples.${key}`)}
              </span>
            </span>
          )}
          renderFocus={({ key, className }) => (
            <span className={cn("block whitespace-normal text-pretty", className)}>
              {t(`design.type.samples.${key}`)}
            </span>
          )}
          getFields={({ className }) => {
            const style = styleOfClasses(className);
            return [
              { label: t("inspector.fields.class"), value: className },
              { label: t("inspector.fields.size"), value: style.fontSize },
              { label: t("inspector.fields.weight"), value: style.fontWeight },
              { label: t("inspector.fields.lineHeight"), value: style.lineHeight },
              { label: t("inspector.fields.tracking"), value: style.letterSpacing },
            ];
          }}
        />
      </Demo>
    </>
  );
}
