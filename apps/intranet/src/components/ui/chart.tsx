"use client";

import * as React from "react";

import {
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  type LegendPayload,
  type TooltipContentProps,
} from "recharts";

import { cn } from "@/lib/utils";

/**
 * shadcn's chart primitives, ported to recharts 3.
 *
 * Upstream's copy is written against recharts 2, where `Tooltip`/`Legend`
 * content props still carried `payload` and `label`. In 3 those moved into
 * `TooltipContentProps` / `LegendPayload` and the old prop types no longer
 * typecheck, so the two content components take those types directly rather
 * than deriving from the parent component's props.
 *
 * Two deliberate deviations from upstream, both from the house data-viz rules:
 *
 * - The tooltip's default indicator is a **line key**, not a filled box. At
 *   tooltip density a filled swatch is data-weight ink doing a label's job.
 * - In a tooltip row the **value leads** (strong, high-contrast) and the series
 *   name is secondary — the legend's hierarchy inverted, because a reader who is
 *   already hovering a series wants the number, not the name.
 *
 * Series colours come from `--chart-1…5` (see `globals.css`), which is also what
 * `ui.shadcn.com/charts` examples reference, so a chart pasted from there picks
 * up this palette unedited. Assign slots in order and never cycle.
 */

const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: { label?: React.ReactNode; icon?: React.ComponentType } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          // Recharts draws its own SVG chrome with hard-coded greys; these pull
          // the axes, grid and cursor onto the palette's recessive hairline
          // tokens instead.
          "flex w-full justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-radial-bar-background-sector]:fill-muted",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60",
          "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-dot[stroke='#fff']]:stroke-transparent",
          "[&_.recharts-layer]:outline-hidden",
          "[&_.recharts-sector]:outline-hidden",
          "[&_.recharts-sector[stroke='#fff']]:stroke-transparent",
          "[&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/**
 * Emits `--color-<key>` per series so a mark can be written as
 * `stroke="var(--color-ticketsOpened)"` and stay readable, instead of repeating
 * a raw palette token at every call site.
 */
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, c]) => c.theme || c.color);
  if (!colorConfig.length) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof THEMES] || itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join("\n")}
}`,
          )
          .join("\n"),
      }}
    />
  );
}

const ChartTooltip = RechartsTooltip;

type TooltipEntry = TooltipContentProps<number | string, number | string>["payload"][number];

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "line",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  nameKey,
  labelKey,
}: Partial<TooltipContentProps<number | string, number | string>> & {
  className?: string;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  labelClassName?: string;
}) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null;
    const [firstItem] = payload;
    const key = `${labelKey || firstItem?.dataKey || firstItem?.name || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, firstItem, key);
    const value =
      !labelKey && typeof label === "string" ? (config[label]?.label ?? label) : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>{labelFormatter(label, payload)}</div>
      );
    }
    if (!value) return null;
    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "grid min-w-[9rem] items-start gap-1.5 rounded-xl border border-border/60 bg-popover px-3 py-2 text-xs shadow-[0_16px_40px_-16px_rgb(0_0_0/0.45)]",
        className,
      )}
    >
      {tooltipLabel ? <div className="text-muted-foreground">{tooltipLabel}</div> : null}
      <div className="grid gap-1">
        {payload.map((item: TooltipEntry, index: number) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = item.stroke || item.fill || item.color;

          return (
            <div key={`${item.dataKey ?? index}`} className="flex w-full items-center gap-2">
              {itemConfig?.icon ? (
                <itemConfig.icon />
              ) : (
                !hideIndicator && (
                  <span
                    className={cn("shrink-0 rounded-full", {
                      "h-0.5 w-3": indicator === "line",
                      "size-2": indicator === "dot",
                      "h-0 w-3 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
                    })}
                    style={{
                      background: indicator === "dashed" ? undefined : indicatorColor,
                      borderColor: indicatorColor,
                    }}
                  />
                )
              )}
              <div className="flex flex-1 items-baseline justify-between gap-3 leading-none">
                <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
                {item.value !== undefined && (
                  <span className="font-semibold tabular-nums text-foreground">
                    {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsLegend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
  /** `line` mirrors a line mark, `rect` an area or bar mark — a legend key
   * should look like the mark it stands for. */
  markShape = "rect",
}: {
  className?: string;
  hideIcon?: boolean;
  payload?: ReadonlyArray<LegendPayload>;
  verticalAlign?: "top" | "middle" | "bottom";
  nameKey?: string;
  markShape?: "line" | "rect";
}) {
  const { config } = useChart();
  if (!payload?.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || item.value || "value"}`;
        const itemConfig = getPayloadConfigFromPayload(config, item, key);

        return (
          <div key={item.value} className="flex items-center gap-1.5 text-muted-foreground">
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <span
                className={cn(
                  "shrink-0",
                  markShape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2 rounded-[2px]",
                )}
                style={{ background: item.color }}
              />
            )}
            {itemConfig?.label ?? item.value}
          </div>
        );
      })}
    </div>
  );
}

/** Resolves a recharts payload entry back to its `ChartConfig` entry, checking
 * the nested `payload` object too so a `dataKey`-vs-`name` mismatch still lands. */
function getPayloadConfigFromPayload(config: ChartConfig, entry: unknown, key: string) {
  if (typeof entry !== "object" || entry === null) return undefined;

  const nested =
    "payload" in entry && typeof entry.payload === "object" && entry.payload !== null
      ? (entry.payload as Record<string, unknown>)
      : undefined;

  let configKey = key;
  const direct = (entry as Record<string, unknown>)[key];
  if (typeof direct === "string") configKey = direct;
  else if (nested && typeof nested[key] === "string") configKey = nested[key] as string;

  return config[configKey] ?? config[key];
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
};
