"use client";

import { useEffect, useRef, useState } from "react";

import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Copy, CornerUpLeft, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  chatBubbleClass,
  LONG_PRESS_MS,
  SWIPE_REPLY_THRESHOLD,
} from "@/components/chat/chat-surface";
import { Demo } from "@/components/playground/Demo";
import { Button } from "@/components/ui/button";
import { TogglePill } from "@/components/ui/filter-pill";
import { cn } from "@/lib/utils";

interface Spring {
  stiffness: number;
  damping: number;
  mass: number;
}

/** Springs the intranet really uses, and where. */
const PRESETS: { key: string; source: string; spring: Spring }[] = [
  {
    key: "follow",
    source: "hooks/use-physics-drag.ts",
    spring: { stiffness: 520, damping: 34, mass: 0.7 },
  },
  {
    key: "lift",
    source: "hooks/use-physics-drag.ts",
    spring: { stiffness: 380, damping: 16, mass: 1 },
  },
  {
    key: "tabs",
    source: "components/layout/bottom-nav-tabs.tsx",
    spring: { stiffness: 380, damping: 32, mass: 1 },
  },
  {
    key: "tour",
    source: "components/tour/TourSpotlight.tsx",
    spring: { stiffness: 280, damping: 32, mass: 1 },
  },
];

const SLIDERS: { key: keyof Spring; min: number; max: number; step: number }[] = [
  { key: "stiffness", min: 50, max: 900, step: 10 },
  { key: "damping", min: 2, max: 60, step: 1 },
  { key: "mass", min: 0.2, max: 4, step: 0.1 },
];

const BALL = 40;

function SpringTuner() {
  const t = useTranslations("Playground");
  const [spring, setSpring] = useState<Spring>(PRESETS[0].spring);
  const [right, setRight] = useState(false);
  const [distance, setDistance] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setDistance(Math.max(0, track.clientWidth - BALL - 16));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const preset = PRESETS.find(
    (p) =>
      p.spring.stiffness === spring.stiffness &&
      p.spring.damping === spring.damping &&
      p.spring.mass === spring.mass,
  );
  const code = `transition={{ type: "spring", stiffness: ${spring.stiffness}, damping: ${spring.damping}${spring.mass === 1 ? "" : `, mass: ${spring.mass}`} }}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <TogglePill
            key={p.key}
            active={preset?.key === p.key}
            onClick={() => setSpring(p.spring)}
          >
            {t(`motion.spring.presets.${p.key}`)}
          </TogglePill>
        ))}
      </div>

      <div
        ref={trackRef}
        className="relative h-16 cursor-pointer rounded-lg bg-muted/40"
        onClick={() => setRight((r) => !r)}
      >
        <motion.span
          className="absolute left-2 top-3 block rounded-full bg-primary shadow-sm"
          style={{ width: BALL, height: BALL }}
          animate={{ x: right ? distance : 0 }}
          transition={{ type: "spring", ...spring }}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[11px] text-muted-foreground">
          {t("motion.spring.hint")}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {SLIDERS.map(({ key, min, max, step }) => (
          <label key={key} className="space-y-1.5">
            <span className="flex items-baseline justify-between text-[12.5px]">
              <span className="text-muted-foreground">{t(`motion.spring.${key}`)}</span>
              <span className="font-mono tabular-nums">{spring[key]}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={spring[key]}
              onChange={(event) =>
                setSpring((current) => ({ ...current, [key]: Number(event.target.value) }))
              }
              className="w-full accent-primary"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 break-all rounded-md bg-muted px-2 py-1 font-mono text-[12px]">
          {code}
        </code>
        {preset && (
          <span className="font-mono text-[11.5px] text-muted-foreground">{preset.source}</span>
        )}
      </div>
      <Button
        variant="outline"
        size="xs"
        onClick={() =>
          void navigator.clipboard?.writeText(code).then(
            () => toast.success(t("motion.spring.copied")),
            () => undefined,
          )
        }
      >
        <Copy />
        {t("motion.spring.copy")}
      </Button>
    </div>
  );
}

function SwipeToReply() {
  const t = useTranslations("Playground");
  const [replyingTo, setReplyingTo] = useState(false);
  const x = useMotionValue(0);
  const arrowOpacity = useTransform(x, [0, SWIPE_REPLY_THRESHOLD], [0, 1]);
  const arrowScale = useTransform(x, [0, SWIPE_REPLY_THRESHOLD], [0.6, 1]);

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-2 rounded-lg bg-muted/40 p-4">
        <motion.span
          className="absolute left-4 grid size-7 place-items-center rounded-full bg-background text-muted-foreground shadow-sm"
          style={{ opacity: arrowOpacity, scale: arrowScale }}
        >
          <CornerUpLeft className="size-3.5" />
        </motion.span>
        <motion.div
          className={cn(chatBubbleClass(false), "cursor-grab touch-pan-y active:cursor-grabbing")}
          style={{ x }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          dragMomentum={false}
          onDragEnd={(_event, info: PanInfo) => {
            if (Math.abs(info.offset.x) > SWIPE_REPLY_THRESHOLD) setReplyingTo(true);
          }}
        >
          {t("motion.swipe.message")}
        </motion.div>
      </div>
      <div className="flex min-h-9 items-center gap-2">
        {replyingTo ? (
          <>
            <span className="flex-1 rounded-md border-l-2 border-primary/60 bg-muted/50 px-2.5 py-1.5 text-[12.5px]">
              {t("motion.swipe.replying")}
            </span>
            <Button variant="ghost" size="xs" onClick={() => setReplyingTo(false)}>
              {t("reset")}
            </Button>
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            {t("motion.swipe.hint", { px: SWIPE_REPLY_THRESHOLD })}
          </p>
        )}
      </div>
    </div>
  );
}

const SHEET_ACTIONS = [
  { key: "reply", icon: CornerUpLeft },
  { key: "copy", icon: Copy },
  { key: "edit", icon: Pencil },
  { key: "delete", icon: Trash2 },
] as const;

function LongPress() {
  const t = useTranslations("Playground");
  const [pressing, setPressing] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  function start() {
    setOpen(false);
    setPressing(true);
    timer.current = window.setTimeout(() => {
      setPressing(false);
      setOpen(true);
    }, LONG_PRESS_MS);
  }

  function cancel() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid place-items-center rounded-lg bg-muted/40 p-6">
        <button
          type="button"
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onContextMenu={(event) => event.preventDefault()}
          className={cn(
            chatBubbleClass(true),
            "relative select-none overflow-hidden transition-transform",
            pressing && "scale-95",
          )}
        >
          <span
            className="absolute inset-y-0 left-0 bg-foreground/10"
            style={{
              width: pressing ? "100%" : "0%",
              transition: pressing ? `width ${LONG_PRESS_MS}ms linear` : "none",
            }}
          />
          <span className="relative">{t("motion.press.message")}</span>
        </button>
      </div>
      <div className="min-h-40">
        {open ? (
          <motion.ul
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card"
          >
            {SHEET_ACTIONS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13.5px] hover:bg-accent/60",
                    key === "delete" && "text-destructive",
                  )}
                >
                  <Icon className="size-4" />
                  {t(`motion.press.actions.${key}`)}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : (
          <p className="pt-2 text-[12.5px] text-muted-foreground">
            {t("motion.press.hint", { ms: LONG_PRESS_MS })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PlaygroundMotionPage() {
  const t = useTranslations("Playground");
  return (
    <>
      <Demo title={t("motion.spring.title")} description={t("motion.spring.description")}>
        <SpringTuner />
      </Demo>
      <Demo
        title={t("motion.swipe.title")}
        description={t("motion.swipe.description")}
        source="components/chat/ConversationView.tsx"
      >
        <SwipeToReply />
      </Demo>
      <Demo
        title={t("motion.press.title")}
        description={t("motion.press.description")}
        source="components/chat/ConversationView.tsx"
      >
        <LongPress />
      </Demo>
    </>
  );
}
