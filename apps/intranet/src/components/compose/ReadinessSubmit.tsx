"use client";

import { type ComponentProps, type ReactNode, useState } from "react";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

import { type ReadinessCheck, ReadinessCard, scoreReadiness } from "./Readiness";

/**
 * The save button every composer shares: saves when everything required is
 * there, otherwise says what isn't — anchored to the button on desktop, as a
 * sheet on a phone, where a floating card has nowhere good to go.
 */
export function ReadinessSubmit({
  checks,
  readyTitle,
  busy,
  disabled,
  onSubmit,
  size,
  className,
  children,
}: {
  checks: ReadinessCheck[];
  readyTitle?: string;
  busy?: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { canSubmit } = scoreReadiness(checks);
  const fixable = checks.map((check) =>
    check.onFix
      ? {
          ...check,
          onFix: () => {
            setOpen(false);
            check.onFix?.();
          },
        }
      : check,
  );

  const label = busy ? <Loader2 className="animate-spin" /> : children;

  if (isMobile) {
    return (
      <>
        <Button
          size={size}
          className={className}
          disabled={busy || disabled}
          onClick={() => (canSubmit ? onSubmit() : setOpen(true))}
        >
          {label}
        </Button>
        <MobileDrawer
          open={open}
          onOpenChange={setOpen}
          ariaLabel={readyTitle}
          className="h-auto max-h-[88dvh]"
        >
          <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-1">
            <ReadinessCard checks={fixable} readyTitle={readyTitle} />
          </div>
        </MobileDrawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size={size}
          className={className}
          disabled={busy || disabled}
          onClick={(e) => {
            // Ready: just save. Not ready: let the popover open instead.
            if (canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] border-0 bg-transparent p-0 shadow-none">
        <ReadinessCard checks={fixable} readyTitle={readyTitle} className="shadow-overlay" />
      </PopoverContent>
    </Popover>
  );
}
