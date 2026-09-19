"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { AnimatePresence, LayoutGroup, MotionConfig, motion, type Variants } from "framer-motion";
import { Check, Copy, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface InspectField {
  label: string;
  value: string;
  /** Shown instead of `value`, e.g. a swatch next to a colour. */
  display?: ReactNode;
}

/** Where a tile flew off to, so it can run back in from the same place. */
interface Flight {
  x: number;
  y: number;
  rotate: number;
  /** How far it was from the picked one — the near ones come back first. */
  order: number;
}

interface TileCustom {
  flight?: Flight;
  index: number;
}

const MOVE = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;
/** Low damping, so they overshoot and settle like something landing. */
const LAND = { type: "spring", stiffness: 260, damping: 14, mass: 0.9 } as const;
const FLEE_DISTANCE = 150;
const GRAVITY_DROP = 140;

const tileVariants: Variants = {
  // Running back in: from where it flew to, a bit higher, still spinning.
  hidden: ({ flight }: TileCustom) =>
    flight
      ? {
          opacity: 0,
          x: flight.x,
          y: flight.y * 0.6 - 30,
          rotate: -flight.rotate,
          scale: 0.8,
        }
      : // The one that was picked morphs back into place on its own.
        {},
  shown: ({ flight, index }: TileCustom) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      ...LAND,
      delay: (flight?.order ?? index) * 0.035,
      opacity: { duration: 0.2, delay: (flight?.order ?? index) * 0.035 },
    },
  }),
  // Knocked away from the picked one: a little hop, outwards, then falling.
  gone: ({ flight }: TileCustom) =>
    flight
      ? {
          opacity: [1, 1, 0],
          x: [0, flight.x * 0.35, flight.x],
          y: [0, flight.y * 0.35 - 26, flight.y + GRAVITY_DROP],
          rotate: [0, flight.rotate * 0.4, flight.rotate],
          scale: [1, 1.04, 0.85],
          filter: ["blur(0px)", "blur(0px)", "blur(3px)"],
          transition: {
            duration: 0.6,
            times: [0, 0.28, 1],
            ease: ["easeOut", "easeIn"],
            delay: flight.order * 0.02,
          },
        }
      : { opacity: 0, transition: { duration: 0.15 } },
};

/**
 * A grid of things to look at. Pick one and the rest get knocked out of the
 * way while it lands on the left and its details come in beside it, each with
 * a copy button. Close it and the others run back in.
 */
export function Inspector<T>({
  items,
  getKey,
  getLabel,
  renderTile,
  renderFocus,
  getFields,
  gridClassName,
  tileClassName,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  renderTile: (item: T) => ReactNode;
  /** The picked one, when it should look different up close. Defaults to the tile. */
  renderFocus?: (item: T) => ReactNode;
  /** Called when one is opened, so values are read off the live page as it is then. */
  getFields: (item: T) => InspectField[];
  gridClassName?: string;
  tileClassName?: string;
}) {
  const t = useTranslations("Playground");
  const group = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [fields, setFields] = useState<InspectField[]>([]);
  const [flights, setFlights] = useState<Record<string, Flight>>({});
  const tiles = useRef(new Map<string, HTMLElement>());
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = selected === null ? null : items.find((i) => getKey(i) === selected);

  function open(entry: T) {
    const key = getKey(entry);
    const from = tiles.current.get(key)?.getBoundingClientRect();
    const next: Record<string, Flight> = {};
    if (from) {
      const cx = from.left + from.width / 2;
      const cy = from.top + from.height / 2;
      const others = [...tiles.current.entries()]
        .filter(([k]) => k !== key)
        .map(([k, el]) => {
          const r = el.getBoundingClientRect();
          const dx = r.left + r.width / 2 - cx;
          const dy = r.top + r.height / 2 - cy;
          return { k, dx, dy, dist: Math.hypot(dx, dy) || 1 };
        })
        .sort((a, b) => a.dist - b.dist);
      others.forEach(({ k, dx, dy, dist }, order) => {
        const push = FLEE_DISTANCE + Math.random() * 60;
        next[k] = {
          x: (dx / dist) * push,
          y: (dy / dist) * push * 0.6,
          rotate: (dx >= 0 ? 1 : -1) * (12 + Math.random() * 22),
          order,
        };
      });
    }
    setFlights(next);
    setFields(getFields(entry));
    setSelected(key);
  }

  useEffect(() => {
    if (selected === null) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={group}>
        <motion.div layout transition={MOVE} className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            {item ? (
              <motion.div
                key="focus"
                className="flex flex-col gap-5 sm:flex-row sm:items-start"
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <motion.button
                  type="button"
                  layoutId={`${group}-${selected}`}
                  transition={LAND}
                  // Lifts as it travels and wobbles once it lands, like the drag.
                  animate={{
                    scale: [1, 1.07, 0.98, 1],
                    rotate: [0, -3, 1.5, 0],
                    transition: { duration: 0.7, times: [0, 0.35, 0.7, 1] },
                  }}
                  onClick={() => setSelected(null)}
                  aria-label={t("inspector.close")}
                  className={cn(
                    tileClassName,
                    "relative shrink-0 cursor-zoom-out sm:w-60",
                    "shadow-[0_0_0_2px_var(--color-background),0_0_0_4px_color-mix(in_oklch,var(--color-foreground)_22%,transparent),0_18px_40px_-18px_color-mix(in_oklch,var(--color-foreground)_45%,transparent)]",
                  )}
                >
                  <motion.div layout="position" transition={LAND}>
                    {(renderFocus ?? renderTile)(item)}
                  </motion.div>
                </motion.button>

                <motion.div
                  className="min-w-0 flex-1"
                  initial={{ opacity: 0, x: 40, rotate: 1.5 }}
                  animate={{ opacity: 1, x: 0, rotate: 0, transition: { ...LAND, delay: 0.12 } }}
                  exit={{ opacity: 0, x: 30, transition: { duration: 0.12 } }}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                      {getLabel(item)}
                    </p>
                    <button
                      ref={closeRef}
                      type="button"
                      onClick={() => setSelected(null)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("inspector.close")}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <dl className="divide-y divide-border/60 rounded-lg border border-border/70">
                    {fields.map((field, i) => (
                      <motion.div
                        key={field.label}
                        initial={{ opacity: 0, x: 24, y: -4 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          y: 0,
                          transition: { ...LAND, delay: 0.18 + i * 0.05 },
                        }}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <dt className="w-28 shrink-0 text-[12px] text-muted-foreground">
                          {field.label}
                        </dt>
                        <dd className="min-w-0 flex-1 break-all font-mono text-[12px] leading-relaxed">
                          {field.display ?? field.value}
                        </dd>
                        <CopyButton value={field.value} label={field.label} />
                      </motion.div>
                    ))}
                  </dl>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                className={gridClassName}
                initial="hidden"
                animate="shown"
                exit="gone"
              >
                {items.map((entry, index) => {
                  const key = getKey(entry);
                  const custom: TileCustom = { flight: flights[key], index };
                  return (
                    <motion.button
                      key={key}
                      ref={(el) => {
                        if (el) tiles.current.set(key, el);
                        else tiles.current.delete(key);
                      }}
                      type="button"
                      custom={custom}
                      variants={tileVariants}
                      layoutId={`${group}-${key}`}
                      transition={LAND}
                      onClick={() => open(entry)}
                      aria-label={t("inspector.open", { name: getLabel(entry) })}
                      whileHover={{ y: -3, rotate: index % 2 ? 1.2 : -1.2 }}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        tileClassName,
                        "cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <motion.div layout="position" transition={LAND}>
                        {renderTile(entry)}
                      </motion.div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("Playground");
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied, copies]);

  return (
    <span className="relative shrink-0">
      <motion.button
        type="button"
        whileTap={{ scale: 0.8 }}
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setCopies((n) => n + 1);
            },
            () => undefined,
          )
        }
        aria-label={t("inspector.copy", { name: label })}
        className={cn(
          "grid size-7 place-items-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          copied ? "text-ok" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ opacity: 0, scale: 0.4, rotate: copied ? -45 : 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {/* A little "Copied" that floats up and fades, once per copy. */}
      <AnimatePresence>
        {copied && (
          <motion.span
            key={copies}
            aria-hidden
            style={{ x: "-50%" }}
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -26, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, times: [0, 0.15, 0.7, 1], ease: "easeOut" }}
            className="pointer-events-none absolute -top-1 left-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[10.5px] font-medium text-background"
          >
            {t("inspector.copied")}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
let probe: HTMLDivElement | null = null;

/** Reads a CSS value the way the page actually renders it right now — theme,
 *  dark mode and all. */
export function resolveStyle(property: string, value: string): string {
  if (typeof document === "undefined") return "";
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
  }
  if (!probe.isConnected) document.body.appendChild(probe);
  probe.style.setProperty(property, value);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  probe.style.removeProperty(property);
  return computed;
}

/** What a set of utility classes comes out as, e.g. the real font size. */
export function styleOfClasses(className: string) {
  const el = document.createElement("span");
  el.className = className;
  el.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  el.textContent = "Ag";
  document.body.appendChild(el);
  const { fontSize, fontWeight, lineHeight, letterSpacing } = getComputedStyle(el);
  el.remove();
  return { fontSize, fontWeight, lineHeight, letterSpacing };
}

/** Any CSS colour as #rrggbb (or #rrggbbaa when see-through), by painting it. */
export function toHex(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return color;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = [r, g, b, ...(a < 255 ? [a] : [])].map((n) => n.toString(16).padStart(2, "0"));
  return `#${hex.join("")}`;
}
