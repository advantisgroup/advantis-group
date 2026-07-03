"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        // `touch-action: pan-x` + `overscroll-x-contain` tell the browser this
        // row only scrolls horizontally — without it, a mostly-horizontal
        // mobile swipe/tap is ambiguous between "scroll the tab bar" and
        // "scroll the page", so taps sometimes get swallowed as a scroll
        // gesture and page scroll leaks in via this row.
        "inline-flex h-10 max-w-full items-center justify-center overflow-x-auto overscroll-x-contain rounded-lg border border-border/70 bg-muted/50 p-1 text-muted-foreground [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // `shrink-0` keeps every trigger at its natural width instead of being
        // squeezed by flex when the bar is close to overflowing — a shrunken
        // trigger is what made taps near the edges miss on mobile.
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
