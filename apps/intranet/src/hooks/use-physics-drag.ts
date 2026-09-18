"use client";

import { useCallback, useMemo, useRef } from "react";

import {
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";

const FOLLOW = { stiffness: 520, damping: 34, mass: 0.7 };

/** Where something will land or what it will become — the same dashed blue
 * slot everywhere things are moved or resized. Pair with a rounding class. */
export const DROP_PREVIEW =
  "border-2 border-dashed border-sky-500/60 bg-sky-500/[0.07] dark:border-sky-400/60 dark:bg-sky-400/10";

/**
 * The motion behind a dragged piece: it lifts, slides so the pointer holds
 * it near its top-left, swings with its speed like something carried, and on
 * drop flies into its slot and settles with a small bounce. Where the piece
 * may land is the caller's business — this only moves it.
 */
export function usePhysicsDrag({
  maxTilt = 11,
  restingTilt = 2.5,
}: { maxTilt?: number; restingTilt?: number } = {}) {
  const reduceMotion = useReducedMotion();

  // `anchor` is the point on the piece the pointer holds — it eases from the
  // grab point towards the top-left so the piece visibly moves into the cursor.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const anchorX = useMotionValue(0);
  const anchorY = useMotionValue(0);
  const anchorXS = useSpring(anchorX, { stiffness: 260, damping: 24 });
  const anchorYS = useSpring(anchorY, { stiffness: 260, damping: 24 });
  const targetX = useTransform(() => px.get() - anchorXS.get());
  const targetY = useTransform(() => py.get() - anchorYS.get());
  const x = useSpring(targetX, FOLLOW);
  const y = useSpring(targetY, FOLLOW);
  const vx = useVelocity(x);
  const vy = useVelocity(y);
  const lift = useSpring(0, { stiffness: 380, damping: 16 });
  // Swings against the direction of travel, plus a small resting tilt.
  const swing = useSpring(
    useTransform(() => {
      if (reduceMotion) return 0;
      const v = vx.get() / 90 + vy.get() / 420;
      return Math.max(-maxTilt, Math.min(maxTilt, v));
    }),
    { stiffness: 300, damping: 18 },
  );
  const rotate = useTransform(() => swing.get() + lift.get() * (reduceMotion ? 0 : restingTilt));
  const scale = useTransform(() => 1 + lift.get() * 0.045);
  const boxShadow = useTransform(
    () =>
      `0 ${4 + lift.get() * 18}px ${10 + lift.get() * 30}px -8px rgb(0 0 0 / ${0.12 + lift.get() * 0.3})`,
  );

  const pickUp = useCallback(
    (
      rect: DOMRect,
      grab: { x: number; y: number },
      pointer: { x: number; y: number },
      hold: { x: number; y: number },
    ) => {
      anchorX.jump(grab.x - rect.left);
      anchorY.jump(grab.y - rect.top);
      anchorXS.jump(grab.x - rect.left);
      anchorYS.jump(grab.y - rect.top);
      px.jump(pointer.x);
      py.jump(pointer.y);
      x.jump(rect.left + (pointer.x - grab.x));
      y.jump(rect.top + (pointer.y - grab.y));
      anchorX.set(hold.x);
      anchorY.set(hold.y);
      lift.set(1);
      navigator.vibrate?.(8);
    },
    [anchorX, anchorY, anchorXS, anchorYS, px, py, x, y, lift],
  );

  // Once dropped, the piece belongs to its slot — pointer moves after release
  // used to keep re-aiming it at the cursor, so it never settled and just got
  // swapped in when the timeout ran out.
  const dropping = useRef(false);

  const move = useCallback(
    (clientX: number, clientY: number) => {
      if (dropping.current) return;
      px.set(clientX);
      py.set(clientY);
    },
    [px, py],
  );

  /** Flies the piece into its slot and resolves once it's there. `slot` is
   * measured every frame, since the slot itself may still be sliding into
   * place from the reorder. */
  const drop = useCallback(
    (slot: () => DOMRect | undefined) =>
      new Promise<void>((resolve) => {
        dropping.current = true;
        anchorX.jump(0);
        anchorY.jump(0);
        anchorXS.jump(0);
        anchorYS.jump(0);
        lift.set(0);
        const started = performance.now();
        const settle = () => {
          const rect = slot();
          if (rect) {
            px.set(rect.left);
            py.set(rect.top);
          }
          const arrived =
            !rect ||
            (Math.abs(x.get() - rect.left) < 0.5 &&
              Math.abs(y.get() - rect.top) < 0.5 &&
              Math.abs(x.getVelocity()) < 20 &&
              Math.abs(y.getVelocity()) < 20);
          if (arrived || performance.now() - started > 1500) {
            dropping.current = false;
            resolve();
          } else {
            requestAnimationFrame(settle);
          }
        };
        requestAnimationFrame(settle);
      }),
    [anchorX, anchorY, anchorXS, anchorYS, px, py, x, y, lift],
  );

  // Stable across renders, so callers can list it as an effect dependency.
  return useMemo(
    () => ({ style: { x, y, rotate, scale, boxShadow }, pickUp, move, drop }),
    [x, y, rotate, scale, boxShadow, pickUp, move, drop],
  );
}
