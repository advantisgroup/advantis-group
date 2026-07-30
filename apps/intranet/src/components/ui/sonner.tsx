"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme/theme-provider";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Solid popover surface with a colored left accent bar + tinted
          // icon, so toasts stay legible over any page background instead of
          // reading as a transparent wash.
          toast: "!shadow-lg !border-l-4 !bg-popover !text-popover-foreground",
          success: "!border-l-success [&_[data-icon]]:text-success",
          error: "!border-l-destructive [&_[data-icon]]:text-destructive",
          warning: "!border-l-warning [&_[data-icon]]:text-warning",
          info: "!border-l-accent-foreground/40 [&_[data-icon]]:text-accent-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
