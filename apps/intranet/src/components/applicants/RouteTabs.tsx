"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface RouteTab {
  value: string;
  href: string;
  label: string;
}

/**
 * URL-driven equivalent of `Tabs`/`TabsList`/`TabsTrigger` — each "tab" is a
 * real link to its own route rather than client-only state, so the active
 * tab is bookmarkable/shareable. Collapses into a `Select` below the mobile
 * breakpoint, where a horizontal tab bar gets cramped alongside a breadcrumb.
 */
export function RouteTabs({
  tabs,
  activeValue,
}: {
  tabs: RouteTab[];
  activeValue: string;
}) {
  const isMobile = useIsMobile();
  const router = useRouter();

  if (isMobile) {
    return (
      <Select
        value={activeValue}
        onValueChange={value => {
          const tab = tabs.find(t => t.value === value);
          if (tab) router.push(tab.href);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tabs.map(tab => (
            <SelectItem key={tab.value} value={tab.value}>
              {tab.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="inline-flex h-10 max-w-full items-center justify-center overflow-x-auto overscroll-x-contain rounded-lg border border-border/70 bg-muted/50 p-1 text-muted-foreground [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
      {tabs.map(tab => (
        <Link
          key={tab.value}
          href={tab.href}
          className={cn(
            "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab.value === activeValue && "bg-card text-foreground shadow-sm"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
