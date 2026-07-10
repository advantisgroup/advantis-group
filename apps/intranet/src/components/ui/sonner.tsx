"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

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
          // Tinted, not solid-filled — a colored left border + soft wash reads
          // as "on brand" rather than a flat traffic-light block.
          success:
            "!bg-success/10 !text-foreground !border-border/70 !border-l-2 !border-l-success [&_[data-icon]]:text-success",
          error:
            "!bg-destructive/10 !text-foreground !border-border/70 !border-l-2 !border-l-destructive [&_[data-icon]]:text-destructive",
          warning:
            "!bg-warning/10 !text-foreground !border-border/70 !border-l-2 !border-l-warning [&_[data-icon]]:text-warning",
          info: "!bg-accent !text-foreground !border-border/70 !border-l-2 !border-l-ring",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
