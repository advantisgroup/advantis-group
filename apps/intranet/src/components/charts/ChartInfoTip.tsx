"use client";

import * as React from "react";

import { Tooltip, type TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { DataKey } from "recharts/types/util/types";

import { cn } from "@/lib/utils";

type ChartInfoTipProps = Omit<TooltipProps<ValueType, NameType>, "formatter"> & {
  formatter?: (
    value: ValueType | undefined,
    name: NameType | undefined,
    item: {
      dataKey?: DataKey<unknown>;
      payload?: unknown;
    },
  ) => React.ReactNode;
  className?: string;
};

export function ChartInfoTip({ formatter, className, ...props }: ChartInfoTipProps) {
  return (
    <Tooltip
      {...props}
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null;

        return (
          <div
            className={cn(
              "rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md",
              className,
            )}
          >
            {label != null && <div className="mb-1 font-medium">{String(label)}</div>}

            <div className="space-y-1">
              {payload.map((item, index) => {
                const content = formatter
                  ? formatter(item.value, item.name, {
                      dataKey: item.dataKey,
                      payload: item.payload,
                    })
                  : item.value;

                if (content == null) return null;

                return (
                  <div
                    key={`${String(item.dataKey ?? index)}`}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-muted-foreground">{String(item.name)}</span>
                    <span>{content}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }}
    />
  );
}
