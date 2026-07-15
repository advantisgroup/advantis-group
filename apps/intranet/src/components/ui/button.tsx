import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Neutral high-contrast primary (Vercel-style): white-on-dark in dark
        // mode, black-on-light in light mode. Decoupled from the brand `primary`
        // token so accents/links stay on-brand.
        default:
          "bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--foreground)_35%,transparent),0_4px_16px_-4px_color-mix(in_oklch,var(--foreground)_45%,transparent)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--destructive)_45%,transparent),0_4px_16px_-4px_color-mix(in_oklch,var(--destructive)_55%,transparent)]",
        outline:
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground hover:border-ring/60 hover:shadow-[0_0_12px_-4px_color-mix(in_oklch,var(--ring)_45%,transparent)]",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:shadow-[0_0_12px_-4px_color-mix(in_oklch,var(--ring)_35%,transparent)]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground hover:shadow-[0_0_10px_-5px_color-mix(in_oklch,var(--ring)_35%,transparent)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // A deliberate range of densities — compact through thick — so toolbars
        // and primary CTAs can sit at different visual weights, Vercel-style.
        default: "h-9 px-4 text-sm [&_svg]:size-4",
        sm: "h-8 rounded-md px-3 text-xs [&_svg]:size-3.5",
        lg: "h-11 rounded-md px-6 text-sm [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
