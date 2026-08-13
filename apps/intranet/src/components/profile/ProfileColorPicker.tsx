"use client";

import { useEffect, useState } from "react";

import { Pipette, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const QUICK_COLORS = ["#8ecae6", "#6d6875", "#b7e4c7", "#e9c5b0", "#d6a6df"];

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const chroma = (value / 100) * (saturation / 100);
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value / 100 - chroma;
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToHsv(hex: string) {
  const normalized = hex.replace("#", "");
  const [red, green, blue] = [0, 2, 4].map(
    (index) => parseInt(normalized.slice(index, index + 2), 16) / 255,
  );
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const hue =
    delta === 0
      ? 0
      : max === red
        ? 60 * (((green - blue) / delta) % 6)
        : max === green
          ? 60 * ((blue - red) / delta + 2)
          : 60 * ((red - green) / delta + 4);
  return {
    hue: (hue + 360) % 360,
    saturation: max === 0 ? 0 : (delta / max) * 100,
    value: max * 100,
  };
}

function ColorControls({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const t = useTranslations("Settings");
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [draftColor, setDraftColor] = useState(value);

  useEffect(() => setHsv(hexToHsv(value)), [value]);
  useEffect(() => setDraftColor(value), [value]);

  function setColor(next: { hue: number; saturation: number; value: number }) {
    setHsv(next);
    onChange(hsvToHex(next.hue, next.saturation, next.value));
  }

  function selectAtPosition(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setColor({
      hue: hsv.hue,
      saturation: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      value: clamp(100 - ((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    });
  }

  return (
    <div className="space-y-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("colorSaturation")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.saturation)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          selectAtPosition(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) selectAtPosition(event);
        }}
        onKeyDown={(event) => {
          const amount = event.shiftKey ? 10 : 2;
          if (event.key === "ArrowLeft")
            setColor({ ...hsv, saturation: clamp(hsv.saturation - amount, 0, 100) });
          if (event.key === "ArrowRight")
            setColor({ ...hsv, saturation: clamp(hsv.saturation + amount, 0, 100) });
          if (event.key === "ArrowUp")
            setColor({ ...hsv, value: clamp(hsv.value + amount, 0, 100) });
          if (event.key === "ArrowDown")
            setColor({ ...hsv, value: clamp(hsv.value - amount, 0, 100) });
        }}
        className="relative aspect-[1.35/1] w-full touch-none cursor-crosshair overflow-hidden rounded-xl border border-border/60 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <span
          aria-hidden
          className="absolute size-5 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_2px_rgba(0,0,0,0.65)]"
          style={{
            left: `calc(${hsv.saturation}% - 0.625rem)`,
            top: `calc(${100 - hsv.value}% - 0.625rem)`,
          }}
        />
      </div>

      <input
        aria-label={t("colorHue")}
        type="range"
        min="0"
        max="360"
        value={hsv.hue}
        onChange={(event) => setColor({ ...hsv, hue: Number(event.target.value) })}
        className="profile-hue-range h-3 w-full cursor-pointer appearance-none rounded-full"
      />

      <div className="flex items-center gap-2">
        <span
          className="size-9 shrink-0 rounded-lg border border-border/70 shadow-sm"
          style={{ backgroundColor: value }}
        />
        <Input
          value={draftColor}
          onChange={(event) => {
            const next = event.target.value;
            setDraftColor(next);
            if (isHexColor(next)) onChange(next.toLowerCase());
          }}
          className="font-mono uppercase"
          aria-label={t("customColor")}
          aria-invalid={draftColor.length > 0 && !isHexColor(draftColor)}
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {QUICK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            onClick={() => onChange(color)}
            className={cn(
              "h-9 rounded-lg border border-white/30 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === color && "ring-2 ring-foreground ring-offset-2",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

export function ProfileColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string) => void;
}) {
  const t = useTranslations("Settings");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const color = value ?? "#38bdf8";
  const trigger = (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start gap-3"
      onClick={() => setOpen((current) => !current)}
    >
      <span
        className="size-5 rounded-md border border-border/70"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-left">{t("customColor")}</span>
      <Pipette className="size-4 text-muted-foreground" />
    </Button>
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        {trigger}
        {open && <ColorControls value={color} onChange={onChange} />}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4 text-primary" />
          {t("customColor")}
        </div>
        <ColorControls value={color} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
