import { type AnimatedButtonProps } from "@/types/contact";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "./button";

export function AnimatedButton({
  buttonState,
  idleText,
  idleIcon: IdleIcon,
  type = "submit",
  disabled = false,
}: AnimatedButtonProps) {
  return (
    <Button type={type} disabled={disabled} className="w-full relative overflow-hidden">
      <span
        className={`flex items-center justify-center gap-2 transition-all duration-500 ${
          buttonState === "idle" ? "translate-x-0 opacity-100" : "translate-x-12 opacity-0"
        }`}
      >
        {idleText}
        <IdleIcon className="w-4 h-4" />
      </span>

      {/* State Icons Overlay */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        {/* Loading Spinner */}
        <span
          className={`col-start-1 row-start-1 transition-all duration-500 ${
            buttonState === "loading"
              ? "translate-x-0 opacity-100 scale-100"
              : buttonState === "idle"
                ? "-translate-x-12 opacity-0 scale-50"
                : "translate-x-12 opacity-0 scale-50"
          }`}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
        </span>

        {/* Success Checkmark */}
        <span
          className={`col-start-1 row-start-1 transition-all duration-500 ${
            buttonState === "success"
              ? "translate-x-0 opacity-100 scale-100"
              : "-translate-x-12 opacity-0 scale-50"
          }`}
        >
          <Check className="w-5 h-5" />
        </span>

        {/* Error X with shake animation */}
        <span
          className={`col-start-1 row-start-1 transition-all duration-500 ${
            buttonState === "error"
              ? "translate-x-0 opacity-100 scale-100 animate-shake"
              : "-translate-x-12 opacity-0 scale-50"
          }`}
        >
          <X className="w-5 h-5" />
        </span>
      </div>
    </Button>
  );
}
