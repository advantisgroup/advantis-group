"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent font-semibold ring-offset-background transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 refreshed:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--foreground)_35%,transparent),0_4px_16px_-4px_color-mix(in_oklch,var(--foreground)_45%,transparent)] refreshed:shadow-none refreshed:hover:bg-foreground/88 refreshed:hover:shadow-none",
        sky: "bg-sky-600 text-white shadow-[0_4px_14px_-5px_rgba(2,132,199,0.85)] hover:bg-sky-500 hover:shadow-[0_8px_22px_-6px_rgba(14,165,233,0.9)] dark:bg-sky-500 dark:hover:bg-sky-400",
        violet:
          "bg-violet-600 text-white shadow-[0_4px_14px_-5px_rgba(124,58,237,0.85)] hover:bg-violet-500 hover:shadow-[0_8px_22px_-6px_rgba(139,92,246,0.9)] dark:bg-violet-500 dark:hover:bg-violet-400",
        rose: "bg-rose-600 text-white shadow-[0_4px_14px_-5px_rgba(225,29,72,0.85)] hover:bg-rose-500 hover:shadow-[0_8px_22px_-6px_rgba(244,63,94,0.9)] dark:bg-rose-500 dark:hover:bg-rose-400",
        emerald:
          "bg-emerald-600 text-white shadow-[0_4px_14px_-5px_rgba(5,150,105,0.85)] hover:bg-emerald-500 hover:shadow-[0_8px_22px_-6px_rgba(16,185,129,0.9)] dark:bg-emerald-500 dark:hover:bg-emerald-400",
        prism:
          "border border-border/80 bg-background text-foreground shadow-[-8px_8px_20px_-12px_rgba(244,63,94,0.9),8px_-8px_20px_-12px_rgba(34,211,238,0.9)] hover:border-violet-400/60 hover:bg-accent hover:shadow-[-10px_10px_24px_-10px_rgba(244,63,94,0.95),10px_-10px_24px_-10px_rgba(34,211,238,0.95)]",
        premium:
          "border-violet-400/50 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 text-white shadow-[0_5px_18px_-6px_rgba(192,38,211,0.75)] hover:brightness-110 hover:shadow-[0_9px_24px_-7px_rgba(192,38,211,0.9)]",
        // White on a slowly turning rainbow glow — see .btn-sunrise in globals.css.
        sunrise: "btn-sunrise",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--destructive)_45%,transparent),0_4px_16px_-4px_color-mix(in_oklch,var(--destructive)_55%,transparent)] refreshed:shadow-none refreshed:hover:shadow-none",
        outline:
          "border-border bg-card/70 text-foreground shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_8%,transparent)] hover:border-ring/60 hover:bg-accent hover:text-accent-foreground hover:shadow-[0_4px_12px_-5px_color-mix(in_oklch,var(--ring)_55%,transparent)] refreshed:bg-card refreshed:shadow-none refreshed:hover:border-border refreshed:hover:shadow-none",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_8%,transparent)] hover:bg-secondary/80 hover:shadow-[0_4px_12px_-5px_color-mix(in_oklch,var(--ring)_35%,transparent)] refreshed:shadow-none refreshed:hover:shadow-none",
        ghost:
          "hover:bg-accent hover:text-accent-foreground hover:shadow-[0_0_10px_-5px_color-mix(in_oklch,var(--ring)_35%,transparent)] refreshed:hover:shadow-none",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 px-4 text-sm md:h-9 [&_svg]:size-4 refreshed:px-3 refreshed:text-[13px] refreshed:md:h-8",
        sm: "h-9 px-3 text-xs md:h-8 [&_svg]:size-3.5 refreshed:text-[13px]",
        lg: "h-11 px-6 text-sm [&_svg]:size-4",
        xl: "h-12 px-7 text-base [&_svg]:size-4.5",
        xs: "h-8 gap-1 px-2.5 text-xs md:h-7 [&_svg]:size-3",
        icon: "size-10 md:size-9 [&_svg]:size-4",
        "icon-sm": "size-9 md:size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/* How far the sunrise glow's centre may lean towards the pointer, in px. Small
   on purpose: enough to notice, not enough to look like the glow came loose. */
const SUNRISE_LEAN_PX = 5;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onPointerMove, onPointerLeave, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isSunrise = variant === "sunrise";

    // The glow leans towards the pointer on the x axis only — vertical movement
    // inside the button leaves it where it is. CSS reads --sunrise-x.
    const handlePointerMove = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerMove?.(event);
        if (!isSunrise) return;
        const target = event.currentTarget;
        const { left, width } = target.getBoundingClientRect();
        if (!width) return;
        const fromCentre = Math.max(-1, Math.min(1, ((event.clientX - left) / width - 0.5) * 2));
        target.style.setProperty("--sunrise-x", `${(fromCentre * SUNRISE_LEAN_PX).toFixed(2)}px`);
      },
      [isSunrise, onPointerMove],
    );

    const handlePointerLeave = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerLeave?.(event);
        if (!isSunrise) return;
        event.currentTarget.style.removeProperty("--sunrise-x");
      },
      [isSunrise, onPointerLeave],
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
