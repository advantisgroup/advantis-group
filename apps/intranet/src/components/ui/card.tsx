import * as React from "react";

import { cn } from "@/lib/utils";

interface CardProps extends React.ComponentProps<"div"> {
  nested?: boolean;
}

function Card({ className, nested = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        // A faint top-down sheen (a hair lighter at the top, fading out) gives
        // surfaces subtle depth without reading as a coloured gradient.
        "bg-card bg-gradient-to-b from-white/[0.025] to-transparent text-card-foreground flex flex-col rounded-[var(--radius)] border border-border/70",
        nested
          ? "shadow-none"
          : "shadow-[0_1px_2px_0_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.10)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        // Stack title over description vertically. (Previously a flex row, which
        // pushed CardDescription to the right of the title.) For a right-aligned
        // action, give the header a custom row layout at the call site.
        "flex flex-col gap-1.5 p-5 [.border-b]:pb-4",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-5 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-5 pt-0 [.border-t]:pt-4", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
