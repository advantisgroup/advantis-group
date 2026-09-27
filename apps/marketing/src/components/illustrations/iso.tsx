"use client";

import type { PointerEvent, ReactNode } from "react";

import { motion, useReducedMotion, useSpring } from "framer-motion";

import { cn } from "@/lib/utils";

/*
 * The site's illustration kit: isometric line drawings, one stroke weight,
 * the ink colour of whatever they sit on, and at most one red element per
 * drawing. Every homepage visual is built from these parts so they read as
 * one family rather than as borrowed clip art.
 */

const COS = Math.cos(Math.PI / 6);

/** World (x, y, z) to screen. x runs down-right, y down-left, z straight up. */
export const iso = (x: number, y: number, z: number) => [(x - y) * COS, (x + y) * 0.5 - z] as const;

const points = (...corners: (readonly [number, number])[]) =>
  corners.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");

// Faces are filled with the tile's own colour so a box hides what's behind
// it; the two sides are shaded a touch so the thing reads as solid.
const FACE = {
  top: "var(--tile)",
  right: "color-mix(in oklch, var(--tile) 90%, currentColor)",
  front: "color-mix(in oklch, var(--tile) 82%, currentColor)",
};
const LIT = {
  top: "color-mix(in oklch, var(--tile) 70%, var(--iso-accent))",
  right: "color-mix(in oklch, var(--tile) 55%, var(--iso-accent))",
  front: "color-mix(in oklch, var(--tile) 42%, var(--iso-accent))",
};

/** A box standing at (x, y, z), `w` along x, `d` along y, `h` tall. */
export const IsoBox = ({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  lit = false,
  lift = 0,
}: {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  lit?: boolean;
  /** Extra height it floats at; animated, so a box can rise and settle. */
  lift?: number;
}) => {
  const top = z + h;
  const face = lit ? LIT : FACE;
  const spring = { type: "spring", stiffness: 140, damping: 18 } as const;

  // The outlines animate too, so a box whose height changes grows rather than jumps.
  const faces = [
    {
      fill: face.right,
      points: points(
        iso(x + w, y, top),
        iso(x + w, y + d, top),
        iso(x + w, y + d, z),
        iso(x + w, y, z),
      ),
    },
    {
      fill: face.front,
      points: points(
        iso(x, y + d, top),
        iso(x + w, y + d, top),
        iso(x + w, y + d, z),
        iso(x, y + d, z),
      ),
    },
    {
      fill: face.top,
      points: points(
        iso(x, y, top),
        iso(x + w, y, top),
        iso(x + w, y + d, top),
        iso(x, y + d, top),
      ),
    },
  ];

  return (
    <motion.g
      initial={false}
      animate={{ y: -lift }}
      transition={spring}
      stroke={lit ? "var(--iso-accent)" : "currentColor"}
    >
      {faces.map((polygon, index) => (
        <motion.polygon
          key={index}
          fill={polygon.fill}
          initial={false}
          animate={{ points: polygon.points }}
          transition={spring}
        />
      ))}
    </motion.g>
  );
};

/** A flat ring on the ground plane, centred on (x, y, z). */
export const IsoRing = ({
  x = 0,
  y = 0,
  z = 0,
  r,
  className,
}: {
  x?: number;
  y?: number;
  z?: number;
  r: number;
  className?: string;
}) => {
  const [cx, cy] = iso(x, y, z);
  // A circle on the ground projects to an ellipse √3 : 1 wide.
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={r * COS * Math.SQRT2}
      ry={r * 0.5 * Math.SQRT2}
      className={className}
    />
  );
};

/** How far a tile leans toward the pointer, in degrees. */
const TILT = 5;

/**
 * The ground an illustration sits on. `--tile` is the colour the faces fill
 * with, so it has to match the background exactly — hence one component
 * owning both.
 *
 * It leans a few degrees toward a mouse pointer and settles back when the
 * pointer leaves: enough to feel like an object on the page, not enough to
 * notice as an effect. Touch and reduced motion get it flat.
 */
export const IsoTile = ({
  children,
  viewBox = "-200 -150 400 300",
  tone = "paper",
  className,
  label,
  accent,
  ground,
  tilt = true,
}: {
  children: ReactNode;
  viewBox?: string;
  tone?: "paper" | "ink";
  className?: string;
  label?: string;
  /** The one colour the drawing is allowed; the site red unless a brand brings its own. */
  accent?: string;
  /** Overrides the tile colour, e.g. a wash of a brand's colour. */
  ground?: string;
  /** Off when the tile is part of a bigger card that shouldn't warp on its own. */
  tilt?: boolean;
}) => {
  const reduced = useReducedMotion();
  const spring = { stiffness: 150, damping: 18 };
  const rotateX = useSpring(0, spring);
  const rotateY = useSpring(0, spring);

  const lean = (event: PointerEvent<HTMLDivElement>) => {
    if (!tilt || reduced || event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width - 0.5;
    const py = (event.clientY - box.top) / box.height - 0.5;
    rotateY.set(px * TILT * 2);
    rotateX.set(-py * TILT * 2);
  };

  const settle = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div className="[perspective:900px]" onPointerMove={lean} onPointerLeave={settle}>
      <motion.div
        style={{
          rotateX,
          rotateY,
          ...(accent ? { "--iso-accent": accent } : {}),
          ...(ground ? { "--tile": ground } : {}),
        }}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-[var(--tile)] [--iso-accent:var(--primary)]",
          tone === "paper"
            ? "text-foreground/55 [--tile:var(--secondary)]"
            : "text-on-ink/55 [--tile:color-mix(in_oklch,var(--ink)_88%,var(--on-ink))]",
          className,
        )}
      >
        <svg
          viewBox={viewBox}
          role={label ? "img" : undefined}
          aria-label={label}
          aria-hidden={label ? undefined : true}
          className="absolute inset-0 size-full"
          fill="none"
          strokeWidth={1}
          strokeLinejoin="round"
        >
          {children}
        </svg>
      </motion.div>
    </div>
  );
};
