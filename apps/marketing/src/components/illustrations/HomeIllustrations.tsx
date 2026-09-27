"use client";

import { useEffect, useRef, useState } from "react";

import { motion, useInView, useReducedMotion } from "framer-motion";

import { iso, IsoBox, IsoRing, IsoTile } from "./iso";

/*
 * The homepage's drawings. Each one draws what the section next to it is
 * about, and moves only while it's on screen; with reduced motion each
 * holds a still frame that still makes the point.
 */

const useLive = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduced = useReducedMotion();
  return { ref, live: inView && !reduced, reduced };
};

type Point = readonly [number, number];

const TRACK_Z = 4;
const at = (x: number, y: number, z = TRACK_Z) => iso(x, y, z);

// Where each lead goes: one of the three lanes, or out at the AI gate.
const LEADS: { lane: number | null; delay: number }[] = [
  { lane: -38, delay: 0 },
  { lane: null, delay: 0.7 },
  { lane: 0, delay: 1.4 },
  { lane: 38, delay: 2.1 },
  { lane: null, delay: 2.8 },
  { lane: 0, delay: 3.5 },
];
const LANES = [-38, 0, 38];

/**
 * The four stages as one conveyor: a tower sending out signals, the AI gate
 * that turns some leads away, a switch onto one of three lanes, and a block
 * at the end of each lane — the deal. The station for the stage being read
 * is the red one.
 */
export const SignalPipeline = ({
  active,
  className,
  label,
}: {
  active: number;
  className?: string;
  label?: string;
}) => {
  const { ref, live } = useLive();
  const [towerX, towerY] = iso(-132, 0, 0);

  return (
    <div ref={ref} className={className}>
      <IsoTile tone="ink" label={label} viewBox="-168 -142 336 252" className="aspect-[4/3]">
        {/* Signals going out from the tower. */}
        {[0, 1, 2].map((ring) =>
          live ? (
            <motion.ellipse
              key={ring}
              cx={towerX}
              cy={towerY}
              stroke={active === 0 ? "var(--iso-accent)" : "currentColor"}
              initial={{ rx: 12, ry: 6, opacity: 0 }}
              animate={{ rx: [12, 78], ry: [6, 39], opacity: [0.9, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.8, ease: "easeOut" }}
            />
          ) : (
            <IsoRing key={ring} x={-132} r={22 + ring * 18} className="stroke-current opacity-40" />
          ),
        )}

        <IsoBox x={-160} y={-14} z={-5} w={180} d={28} h={5} />
        {LANES.map((lane) => (
          <IsoBox key={lane} x={20} y={lane - 7} z={-5} w={78} d={14} h={5} lit={active === 2} />
        ))}

        <IsoBox x={-140} y={-8} w={16} d={16} h={58} lit={active === 0} />

        {/* The gate: back post, front post, beam across. */}
        <IsoBox x={-54} y={-30} w={8} d={8} h={42} lit={active === 1} />
        <IsoBox x={-54} y={22} w={8} d={8} h={42} lit={active === 1} />
        <IsoBox x={-54} y={-30} z={42} w={8} d={60} h={6} lit={active === 1} />

        {LANES.map((lane) => (
          <IsoBox key={lane} x={100} y={lane - 10} w={22} d={20} h={18} lit={active === 3} />
        ))}

        {live
          ? LEADS.map((lead) => {
              const path: Point[] =
                lead.lane === null
                  ? [at(-132, 0), at(-50, 0), iso(-20, 56, -24)]
                  : [at(-132, 0), at(-50, 0), at(12, 0), at(36, lead.lane), at(104, lead.lane)];
              const times = lead.lane === null ? [0, 0.45, 1] : [0, 0.3, 0.55, 0.65, 1];

              return (
                <motion.circle
                  key={lead.delay}
                  r={3.5}
                  stroke="none"
                  fill={lead.lane === null ? "currentColor" : "var(--iso-accent)"}
                  initial={{ cx: path[0][0], cy: path[0][1], opacity: 0 }}
                  animate={{
                    cx: path.map(([x]) => x),
                    cy: path.map(([, y]) => y),
                    opacity: path.map((_, index) =>
                      index === 0 || index === path.length - 1 ? 0 : 1,
                    ),
                  }}
                  transition={{
                    duration: 4.2,
                    times,
                    repeat: Infinity,
                    delay: lead.delay,
                    ease: "linear",
                  }}
                />
              );
            })
          : null}
      </IsoTile>
    </div>
  );
};

// Two speakers, taking turns: `y` is which side of the table they sit on.
const MESSAGES = [
  { x: -66, y: -96, d: 92, h: 50 },
  { x: -22, y: -40, d: 100, h: 38 },
  { x: 22, y: -96, d: 80, h: 58 },
  { x: 66, y: -40, d: 92, h: 42 },
];

/** A conversation: message cards arriving in turn, someone typing the next one. */
export const ChatThread = ({
  className,
  focus = null,
}: {
  className?: string;
  focus?: number | null;
}) => {
  const { ref, live } = useLive();
  // How many messages are showing; it counts up, holds, and starts the thread over.
  const [shown, setShown] = useState(MESSAGES.length);

  useEffect(() => {
    if (!live || focus !== null) {
      setShown(MESSAGES.length);
      return;
    }
    setShown(1);
    const timer = setInterval(
      () => setShown((current) => (current >= MESSAGES.length + 1 ? 1 : current + 1)),
      1300,
    );
    return () => clearInterval(timer);
  }, [live, focus]);

  const next = focus === null ? MESSAGES[shown] : undefined;

  return (
    <div ref={ref} className={className}>
      <IsoTile viewBox="-180 -135 360 270" className="aspect-[4/3]">
        <IsoBox x={-100} y={-112} z={-6} w={200} d={182} h={6} />

        {MESSAGES.map((message, index) => {
          const visible = index < shown;
          const lit =
            focus === null
              ? visible && index === Math.min(shown, MESSAGES.length) - 1
              : index === focus % MESSAGES.length;
          const face = message.x + 5;
          const rows = [message.h - 10, message.h - 20, message.h - 30].filter((z) => z > 6);

          return (
            <motion.g
              key={index}
              initial={false}
              animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 14 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <IsoBox x={message.x} y={message.y} w={5} d={message.d} h={message.h} lit={lit} />
              {rows.map((z, row) => {
                const [x1, y1] = iso(face, message.y + 9, z);
                const [x2, y2] = iso(
                  face,
                  message.y + message.d - (row === rows.length - 1 ? 30 : 10),
                  z,
                );
                return (
                  <line
                    key={z}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={lit ? "var(--iso-accent)" : "currentColor"}
                    strokeLinecap="round"
                    strokeWidth={2}
                    opacity={0.55}
                  />
                );
              })}
            </motion.g>
          );
        })}

        {live && next ? (
          <g>
            {[0, 1, 2].map((dot) => {
              const [cx, cy] = iso(next.x + 5, next.y + 20 + dot * 12, 12);
              return (
                <motion.circle
                  key={dot}
                  cx={cx}
                  r={3}
                  fill="currentColor"
                  stroke="none"
                  initial={{ cy }}
                  animate={{ cy: [cy, cy - 6, cy] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: dot * 0.15 }}
                />
              );
            })}
          </g>
        ) : null}
      </IsoTile>
    </div>
  );
};
const PARTICLES = [
  { x: -70, y: 10, delay: 0, through: false },
  { x: 40, y: -60, delay: 0.5, through: true },
  { x: 60, y: 30, delay: 1, through: false },
  { x: -30, y: -70, delay: 1.5, through: false },
  { x: 10, y: 60, delay: 2, through: true },
  { x: -60, y: -20, delay: 2.5, through: false },
];

/** Leads falling into a funnel; most drop out on the way, a few reach the box. */
export const LeadFunnel = ({
  className,
  focus = null,
}: {
  className?: string;
  focus?: number | null;
}) => {
  const { ref, live } = useLive();
  const rings = [
    { z: 70, r: 95 },
    { z: 40, r: 72 },
    { z: 12, r: 50 },
    { z: -14, r: 30 },
  ];

  return (
    <div ref={ref} className={className}>
      <IsoTile viewBox="-200 -155 400 300" className="aspect-[4/3]">
        <IsoBox x={-24} y={-24} z={-104} w={48} d={48} h={30} lit />
        {rings.map((ring, index) => (
          <IsoRing
            key={ring.z}
            z={ring.z}
            r={ring.r}
            className={
              focus !== null && index === focus % rings.length
                ? "stroke-[var(--iso-accent)] [stroke-width:2]"
                : "stroke-current"
            }
          />
        ))}
        {/* The funnel's two outlines, through each ring's outer edge. */}
        {[-1, 1].map((side) => (
          <polyline
            key={side}
            stroke="currentColor"
            points={rings
              .map((ring) => `${side * ring.r * Math.cos(Math.PI / 6) * Math.SQRT2},${-ring.z}`)
              .join(" ")}
          />
        ))}
        {PARTICLES.map((particle) => {
          const [sx, sy] = iso(particle.x, particle.y, 110);
          const [mx, my] = iso(particle.x * 0.35, particle.y * 0.35, 20);
          const [ex, ey] = iso(0, 0, -70);
          const fill = particle.through ? "var(--iso-accent)" : "currentColor";

          return live ? (
            <motion.circle
              key={particle.delay}
              r={3}
              fill={fill}
              stroke="none"
              initial={{ cx: sx, cy: sy, opacity: 0 }}
              animate={
                particle.through
                  ? { cx: [sx, mx, ex], cy: [sy, my, ey], opacity: [0, 1, 1, 0] }
                  : { cx: [sx, mx], cy: [sy, my], opacity: [0, 1, 0] }
              }
              transition={{ duration: 3, repeat: Infinity, delay: particle.delay, ease: "easeIn" }}
            />
          ) : (
            <circle key={particle.delay} cx={mx} cy={my} r={3} fill={fill} stroke="none" />
          );
        })}
      </IsoTile>
    </div>
  );
};

const GRID_HEIGHTS = [22, 34, 18, 28, 40, 24, 16, 30, 26];
// The order the signal hops in: a walk across the grid, not a random flicker.
const GRID_PATH = [0, 1, 4, 5, 8, 7, 4, 3];
// The block each service in the group lights when it's pointed at.
const FOCUS_BLOCKS = [4, 1, 8, 6];

/** A grid of blocks — the CRM, the tools, the training — with a signal hopping between them. */
export const SystemGrid = ({
  className,
  focus = null,
}: {
  className?: string;
  focus?: number | null;
}) => {
  const { ref, live } = useLive();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!live || focus !== null) return;
    const timer = setInterval(() => setStep((current) => (current + 1) % GRID_PATH.length), 1100);
    return () => clearInterval(timer);
  }, [live, focus]);

  const litIndex = focus === null ? GRID_PATH[step] : FOCUS_BLOCKS[focus % FOCUS_BLOCKS.length];
  // Painter's order: back corner first, front corner last.
  const cells = GRID_HEIGHTS.map((h, index) => ({
    h,
    index,
    row: Math.floor(index / 3),
    col: index % 3,
  })).sort((a, b) => a.row + a.col - (b.row + b.col));

  return (
    <div ref={ref} className={className}>
      <IsoTile viewBox="-200 -140 400 300" className="aspect-[4/3]">
        {cells.map((cell) => (
          <IsoBox
            key={cell.index}
            x={(cell.col - 1) * 58 - 21}
            y={(cell.row - 1) * 58 - 21}
            w={42}
            d={42}
            h={cell.h}
            lit={cell.index === litIndex}
            lift={cell.index === litIndex ? 14 : 0}
          />
        ))}
      </IsoTile>
    </div>
  );
};

/* ── Brands ─────────────────────────────────────────────────────────────── */

const TARGETS = [
  { x: 46, y: -64 },
  { x: 66, y: -6 },
  { x: 40, y: 50 },
];

/** Salespirates: one desk calling out to three prospects, a lead arriving at each in turn. */
const Outreach = ({ live }: { live: boolean }) => {
  const [fromX, fromY] = iso(-60, 2, 34);

  return (
    <>
      <IsoBox x={-100} y={-90} z={-6} w={200} d={170} h={6} />
      <IsoBox x={-72} y={-10} w={24} d={24} h={30} lit />
      {TARGETS.map((target) => (
        <IsoBox key={target.x} x={target.x - 8} y={target.y - 8} w={16} d={16} h={14} />
      ))}
      {live
        ? TARGETS.map((target, index) => {
            const [toX, toY] = iso(target.x, target.y, 18);
            return (
              <motion.circle
                key={target.x}
                r={3.5}
                fill="var(--iso-accent)"
                stroke="none"
                initial={{ cx: fromX, cy: fromY, opacity: 0 }}
                animate={{ cx: [fromX, toX], cy: [fromY, toY], opacity: [0, 1, 1, 0] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  repeatDelay: 1.6,
                  delay: index * 1.1,
                }}
              />
            );
          })
        : null}
    </>
  );
};

const BARS = [20, 34, 52, 76];

/** Rodeo-Consulting: sales realigned and scaled — bars that grow into place. */
const Growth = ({ live }: { live: boolean }) => (
  <>
    <IsoBox x={-100} y={-70} z={-6} w={200} d={140} h={6} />
    {BARS.map((height, index) => (
      <IsoBox
        key={height}
        x={-72 + index * 36}
        y={-14}
        w={24}
        d={24}
        h={live ? height : 6}
        lit={index === BARS.length - 1}
      />
    ))}
  </>
);

const SEATS = [0, 36]
  .flatMap((x) => [-44, -12, 20].map((y) => ({ x, y })))
  .sort((a, b) => a.x + a.y - (b.x + b.y));
const BOARD = { x: -78, y: -40, d: 80, h: 50 };
// The chart the coach is drawing, as (y, z) points on the flipchart's face.
const CHART = [
  [-32, 8],
  [-16, 14],
  [0, 11],
  [16, 20],
  [30, 24],
] as const;

/** Oldschool-train: a training room — a coach at a flipchart that fills up, and hands going up. */
const Classroom = ({ live }: { live: boolean }) => {
  const [step, setStep] = useState(5);
  const [hand, setHand] = useState(0);

  useEffect(() => {
    if (!live) {
      setStep(5);
      return;
    }
    setStep(0);
    const board = setInterval(() => setStep((current) => (current + 1) % 7), 750);
    // Hands go up at their own, slower pace — a question every couple of seconds, not a flicker.
    const hands = setInterval(() => setHand((current) => (current + 1) % SEATS.length), 2200);
    return () => {
      clearInterval(board);
      clearInterval(hands);
    };
  }, [live]);

  const face = BOARD.x + 5;
  const rows = [42, 34, 26];
  const chart = CHART.map(([y, z]) => iso(face, y, z).join(",")).join(" ");

  return (
    <>
      <IsoBox x={-100} y={-80} z={-6} w={200} d={160} h={6} />
      <IsoBox x={BOARD.x} y={BOARD.y} w={5} d={BOARD.d} h={BOARD.h} />
      {rows.map((z, index) => {
        const [x1, y1] = iso(face, BOARD.y + 8, z);
        const [x2, y2] = iso(face, BOARD.y + BOARD.d - (index === 2 ? 34 : 12), z);
        return (
          <motion.line
            key={z}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: step > index ? 0.6 : 0 }}
          />
        );
      })}
      <motion.polyline
        points={chart}
        stroke="var(--iso-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: step > 3 ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      />
      <IsoBox x={-60} y={46} w={12} d={12} h={34} lit />
      {SEATS.map((seat, index) => (
        <IsoBox
          key={`${seat.x}${seat.y}`}
          x={seat.x}
          y={seat.y}
          w={14}
          d={14}
          h={10}
          lit={live && index === hand}
          lift={live && index === hand ? 8 : 0}
        />
      ))}
    </>
  );
};

// Each input's trace across the board into the chip, as (x, y) on the board's surface.
const TRACES = [
  [
    [-77, -53],
    [-40, -53],
    [-40, -10],
    [-24, -10],
  ],
  [
    [77, -53],
    [40, -53],
    [40, -10],
    [24, -10],
  ],
  [
    [-77, 53],
    [-40, 53],
    [-40, 10],
    [-24, 10],
  ],
  [
    [77, 53],
    [40, 53],
    [40, 10],
    [24, 10],
  ],
] as const;

/** Sales-AI-Germany: a circuit — signals running in from four inputs to a chip that answers. */
const Circuit = ({ live }: { live: boolean }) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setPulse((current) => !current), 900);
    return () => clearInterval(timer);
  }, [live]);

  return (
    <>
      <IsoBox x={-100} y={-72} z={-6} w={200} d={144} h={6} />
      {TRACES.map((trace, index) => (
        <polyline
          key={index}
          points={trace.map(([x, y]) => iso(x, y, 0).join(",")).join(" ")}
          stroke="currentColor"
          strokeWidth={1.5}
          opacity={0.7}
        />
      ))}
      {TRACES.map(([[x, y]]) => (
        <IsoBox key={`${x}${y}`} x={x - 5} y={y - 5} w={10} d={10} h={8} />
      ))}
      <IsoBox x={-24} y={-24} w={48} d={48} h={10} />
      <IsoBox x={-12} y={-12} z={10} w={24} d={24} h={6} lit lift={pulse ? 5 : 0} />
      {live
        ? TRACES.map((trace, index) => {
            const path = trace.map(([x, y]) => iso(x, y, 2));
            return (
              <motion.circle
                key={index}
                r={3}
                fill="var(--iso-accent)"
                stroke="none"
                initial={{ cx: path[0][0], cy: path[0][1], opacity: 0 }}
                animate={{
                  cx: path.map(([px]) => px),
                  cy: path.map(([, py]) => py),
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  repeatDelay: 0.6,
                  delay: index * 0.45,
                  ease: "linear",
                }}
              />
            );
          })
        : null}
    </>
  );
};
const BRAND_SCENES = {
  salespirates: Outreach,
  rodeo: Growth,
  oldschool: Classroom,
  salesai: Circuit,
} as const;

/** A brand's drawing, in the brand's colour on a wash of it. */
export const BrandScene = ({
  brand,
  accent,
  ground,
  className,
}: {
  brand: keyof typeof BRAND_SCENES;
  accent: string;
  ground: string;
  className?: string;
}) => {
  const { ref, live } = useLive();
  const Scene = BRAND_SCENES[brand];

  return (
    <div ref={ref} className={className}>
      <IsoTile
        viewBox="-200 -120 400 235"
        accent={accent}
        ground={ground}
        tilt={false}
        className="aspect-[17/10] rounded-none"
      >
        <Scene live={live} />
      </IsoTile>
    </div>
  );
};

/* ── Proof ──────────────────────────────────────────────────────────────── */

const CERTIFICATES = [-60, -20, 20];
const CERT = { y: -55, d: 100, h: 70 };

// A circle drawn flat on a certificate's face (the plane x = face), as a path.
const onFace = (face: number, y: number, z: number, r: number) =>
  Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    const [px, py] = iso(face, y + r * Math.cos(angle), z + r * Math.sin(angle));
    return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(" ") + " Z";

/**
 * Three years in the Sales Presidents Club as three certificates standing one
 * behind the other, the newest stamped with a seal.
 */
export const AwardPodium = ({ className }: { className?: string }) => {
  const { ref, live, reduced } = useLive();
  const [shown, setShown] = useState(CERTIFICATES.length);

  // They rise in one after another the first time the drawing is seen, then stay.
  useEffect(() => {
    if (!live) return;
    setShown(0);
    const timer = setInterval(
      () =>
        setShown((current) => {
          if (current >= CERTIFICATES.length) clearInterval(timer);
          return Math.min(current + 1, CERTIFICATES.length);
        }),
      450,
    );
    return () => clearInterval(timer);
  }, [live]);

  const seal = CERTIFICATES[CERTIFICATES.length - 1] + 4;
  const [sealX, sealY] = iso(seal, CERT.y + 22, 18);

  return (
    <div ref={ref} className={className}>
      <IsoTile viewBox="-170 -140 340 255" className="aspect-[4/3]">
        <IsoBox x={-100} y={-80} z={-6} w={170} d={150} h={6} />
        {CERTIFICATES.map((x, index) => {
          const face = x + 4;
          const latest = index === CERTIFICATES.length - 1;
          const line = (z: number, from: number, to: number, width: number) => {
            const [x1, y1] = iso(face, CERT.y + from, z);
            const [x2, y2] = iso(face, CERT.y + to, z);
            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={width}
                strokeLinecap="round"
                opacity={0.55}
              />
            );
          };

          return (
            <motion.g
              key={x}
              initial={false}
              animate={{ opacity: index < shown ? 1 : 0, y: index < shown ? 0 : 16 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <IsoBox x={x} y={CERT.y} w={4} d={CERT.d} h={CERT.h} lit={latest} />
              {/* An inner frame, a title and two lines of text. */}
              <path
                d={
                  [
                    iso(face, CERT.y + 6, 6),
                    iso(face, CERT.y + CERT.d - 6, 6),
                    iso(face, CERT.y + CERT.d - 6, CERT.h - 6),
                    iso(face, CERT.y + 6, CERT.h - 6),
                  ]
                    .map(([px, py], point) => `${point === 0 ? "M" : "L"} ${px} ${py}`)
                    .join(" ") + " Z"
                }
                stroke={latest ? "var(--iso-accent)" : "currentColor"}
                opacity={0.6}
              />
              {line(CERT.h - 18, 24, 76, 3)}
              {line(CERT.h - 30, 16, 84, 1.5)}
              {line(CERT.h - 38, 30, 84, 1.5)}
            </motion.g>
          );
        })}

        {/* The seal, stamped onto the newest certificate. */}
        <motion.g
          initial={false}
          animate={
            live
              ? { scale: [1.7, 1, 1, 1], opacity: [0, 1, 1, 1] }
              : { scale: 1, opacity: shown >= CERTIFICATES.length || reduced ? 1 : 0 }
          }
          transition={
            live
              ? { duration: 3.6, times: [0, 0.12, 0.9, 1], repeat: Infinity, delay: 1.6 }
              : undefined
          }
        >
          <path d={onFace(seal, CERT.y + 22, 18, 11)} fill="var(--iso-accent)" stroke="none" />
          <path
            d={onFace(seal, CERT.y + 22, 18, 7)}
            stroke="var(--tile)"
            strokeWidth={1.2}
            opacity={0.8}
          />
          <circle cx={sealX} cy={sealY} r={1.8} fill="var(--tile)" stroke="none" />
        </motion.g>
      </IsoTile>
    </div>
  );
};
/* ── The ask ────────────────────────────────────────────────────────────── */

// Each level is smaller than the one it sits on, so every one stays in view.
const LEVELS = [150, 122, 94, 66, 38];
const LEVEL_HEIGHT = 14;

/** The next level: a stepped tower building itself, one level landing at a time, the top one lit. */
export const NextLevel = ({ className }: { className?: string }) => {
  const { ref, live } = useLive();
  // How many levels have landed; it counts up, holds on the full tower, and starts again.
  const [built, setBuilt] = useState(LEVELS.length);

  useEffect(() => {
    if (!live) {
      setBuilt(LEVELS.length);
      return;
    }
    setBuilt(1);
    const timer = setInterval(
      () => setBuilt((current) => (current >= LEVELS.length + 2 ? 1 : current + 1)),
      700,
    );
    return () => clearInterval(timer);
  }, [live]);

  return (
    <div ref={ref} className={className}>
      <IsoTile tone="ink" viewBox="-170 -150 340 255" className="aspect-[4/3]">
        {LEVELS.map((size, index) => {
          const landed = index < built;
          return (
            <motion.g
              key={size}
              initial={false}
              animate={{ opacity: landed ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <IsoBox
                x={-size / 2}
                y={-size / 2}
                z={index * LEVEL_HEIGHT - 20}
                w={size}
                d={size}
                h={LEVEL_HEIGHT}
                lit={index === LEVELS.length - 1}
                lift={landed ? 0 : 40}
              />
            </motion.g>
          );
        })}
      </IsoTile>
    </div>
  );
};
