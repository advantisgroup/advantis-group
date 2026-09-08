"use client";

import * as React from "react";

import { OTPInput, OTPInputContext } from "input-otp";
import { Minus } from "lucide-react";

import { cn } from "@/lib/utils";

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn("flex items-center gap-2 has-disabled:opacity-50", containerClassName)}
      className={cn(
        // The library sets `user-select: none` on the *container* and only
        // re-enables `pointer-events` on this input — so the field inherits
        // an unselectable state. Desktop Ctrl+V survives that, but iOS and
        // Android refuse to show long-press "Paste" or the keyboard's
        // clipboard suggestion on a field that can't be selected, which is
        // what made pasting a mailed code impossible on a phone.
        "select-text [-webkit-user-select:text]",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & { index: number }) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const slot = inputOTPContext?.slots[index];

  return (
    <div
      data-slot="input-otp-slot"
      data-active={slot?.isActive}
      className={cn(
        // Sized in `flex-1` + `aspect-square` rather than a fixed width so six
        // slots always fit the container — at 320px the row shrinks instead of
        // pushing the last digit off-screen.
        "relative flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-input bg-background/60 text-lg font-medium tabular-nums shadow-xs transition-all outline-none sm:h-14 sm:text-xl",
        "data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/40",
        "aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    >
      {slot?.char}
      {slot?.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      ) : null}
    </div>
  );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <Minus className="size-4 text-muted-foreground/60" />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
