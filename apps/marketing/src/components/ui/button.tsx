"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Ported from the intranet's button so the two apps agree on control sizing
 * and states, with the marketing-only variants dropped.
 *
 * `default` is ink on paper — the page's own foreground colour, inverted.
 * The Advantis red is an accent for marks and highlighted words, not a fill:
 * when every call to action was red, none of them was the one that mattered.
 */
const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/88",
        outline: "border-rule-strong bg-transparent text-foreground hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "h-auto rounded-none p-0 text-foreground underline underline-offset-4 decoration-rule-strong hover:decoration-foreground",
      },
      size: {
        default: "h-10 px-4 text-sm [&_svg]:size-4",
        sm: "h-9 px-3 text-[13px] [&_svg]:size-3.5",
        lg: "h-12 px-6 text-[0.9375rem] [&_svg]:size-4",
        icon: "size-10 [&_svg]:size-4",
        "icon-sm": "size-9 [&_svg]:size-3.5",
      },
      // page-level actions are pills; controls inside a form or a panel keep the default
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    compoundVariants: [{ shape: "pill", size: "sm", className: "px-4" }],
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, shape, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
