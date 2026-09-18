"use client";

import { useId, useMemo, useRef } from "react";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UpdateType } from "@/lib/updates";
import { cn, slugify } from "@/lib/utils";

const VIEW_W = 1200;
const VIEW_H = 320;

const PALETTES: Record<UpdateType, { bgFrom: string; bgTo: string; glow: string; accent: string }> =
  {
    changelog: {
      bgFrom: "#141a3d",
      bgTo: "#28327a",
      glow: "#6c86ff",
      accent: "#cbd6ff",
    },
    incident: {
      bgFrom: "#391414",
      bgTo: "#6e2020",
      glow: "#ff7a63",
      accent: "#ffd9d0",
    },
    maintenance: {
      bgFrom: "#2e2410",
      bgTo: "#634a1c",
      glow: "#ffbb52",
      accent: "#ffe6b8",
    },
  };

const STYLES = [
  "constellation",
  "contours",
  "halftone",
  "orbits",
  "branches",
  "ridgeline",
  "flock",
  "ripples",
] as const;
type ArtStyle = (typeof STYLES)[number];

interface BaseArt {
  style: ArtStyle;
  bgFrom: string;
  bgTo: string;
  glow: string;
  accent: string;
  glowCx: number;
  glowCy: number;
  glowR: number;
}

interface ConstellationArt extends BaseArt {
  style: "constellation";
  nodes: { x: number; y: number; r: number }[];
  edges: [number, number][];
}

interface ContoursArt extends BaseArt {
  style: "contours";
  lines: { d: string; opacity: number; width: number }[];
}

interface HalftoneArt extends BaseArt {
  style: "halftone";
  dots: { x: number; y: number; r: number; opacity: number }[];
}

interface OrbitsArt extends BaseArt {
  style: "orbits";
  rings: { d: string; opacity: number; width: number }[];
}

interface BranchesArt extends BaseArt {
  style: "branches";
  segments: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    opacity: number;
  }[];
}

interface RidgelineArt extends BaseArt {
  style: "ridgeline";
  layers: { d: string; opacity: number }[];
}

interface FlockArt extends BaseArt {
  style: "flock";
  birds: { d: string; opacity: number }[];
}

interface RipplesArt extends BaseArt {
  style: "ripples";
  circles: { r: number; opacity: number; width: number }[];
}

type Art =
  | ConstellationArt
  | ContoursArt
  | HalftoneArt
  | OrbitsArt
  | BranchesArt
  | RidgelineArt
  | FlockArt
  | RipplesArt;

/** FNV-1a — cheap, deterministic, good enough spread for a seeded PRNG. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth open path through a point list (quadratic-through-midpoints). */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  const [lx, ly] = points[points.length - 1];
  d += ` L ${lx} ${ly}`;
  return d;
}

function buildConstellation(
  rand: () => number,
  focalX: number,
  focalY: number,
): Pick<ConstellationArt, "nodes" | "edges"> {
  const nodeCount = 6 + Math.floor(rand() * 4);
  const nodes = Array.from({ length: nodeCount }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = 36 + rand() * 200;
    return {
      x: focalX + Math.cos(angle) * dist,
      y: focalY + Math.sin(angle) * dist * 0.55,
      r: 2.5 + rand() * 4.5,
    };
  });
  const edges: [number, number][] = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push([i, Math.floor(rand() * i)]);
  }
  const extraEdges = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < extraEdges; k++) {
    const a = Math.floor(rand() * nodes.length);
    const b = Math.floor(rand() * nodes.length);
    if (a !== b) edges.push([a, b]);
  }
  return { nodes, edges };
}

function buildContours(rand: () => number): Pick<ContoursArt, "lines"> {
  const lineCount = 5 + Math.floor(rand() * 4);
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const baseY = 20 + ((VIEW_H - 40) * i) / (lineCount - 1);
    const amp = 16 + rand() * 46;
    const phase = rand() * Math.PI * 2;
    const freq = 1 + rand() * 1.4;
    const segs = 7;
    const points: [number, number][] = Array.from({ length: segs + 1 }, (_, s) => {
      const x = (VIEW_W / segs) * s;
      const y = baseY + Math.sin(phase + s * freq) * amp;
      return [x, y];
    });
    return {
      d: smoothPath(points),
      opacity: 0.14 + rand() * 0.3,
      width: 1 + rand() * 1.6,
    };
  });
  return { lines };
}

function buildHalftone(
  rand: () => number,
  focalX: number,
  focalY: number,
): Pick<HalftoneArt, "dots"> {
  const spacing = 38 + rand() * 14;
  const maxDist = 560;
  const dots: HalftoneArt["dots"] = [];
  for (let gy = spacing / 2; gy < VIEW_H; gy += spacing) {
    for (let gx = spacing / 2; gx < VIEW_W; gx += spacing) {
      const dist = Math.hypot(gx - focalX, gy - focalY);
      const falloff = Math.max(0, 1 - dist / maxDist);
      if (falloff < 0.05) continue;
      const jitter = spacing * 0.18;
      dots.push({
        x: gx + (rand() - 0.5) * jitter,
        y: gy + (rand() - 0.5) * jitter,
        r: 0.8 + falloff * falloff * 6.5 * (0.6 + rand() * 0.7),
        opacity: 0.2 + falloff * 0.55,
      });
    }
  }
  return { dots };
}

function buildOrbits(rand: () => number, focalX: number, focalY: number): Pick<OrbitsArt, "rings"> {
  const count = 4 + Math.floor(rand() * 4);
  const rings = Array.from({ length: count }, (_, i) => {
    const r = 46 + i * (26 + rand() * 22);
    const start = rand() * Math.PI * 2;
    const sweep = Math.PI * (0.45 + rand() * 1.15);
    const end = start + sweep;
    const x1 = focalX + Math.cos(start) * r;
    const y1 = focalY + Math.sin(start) * r * 0.62;
    const x2 = focalX + Math.cos(end) * r;
    const y2 = focalY + Math.sin(end) * r * 0.62;
    const largeArc = sweep > Math.PI ? 1 : 0;
    return {
      d: `M ${x1} ${y1} A ${r} ${r * 0.62} 0 ${largeArc} 1 ${x2} ${y2}`,
      opacity: 0.16 + rand() * 0.32,
      width: 1 + rand() * 1.8,
    };
  });
  return { rings };
}

/** Organic branching growth (coral/roots/lightning) radiating from the focal point. */
function buildBranches(
  rand: () => number,
  focalX: number,
  focalY: number,
): Pick<BranchesArt, "segments"> {
  const segments: BranchesArt["segments"] = [];
  function grow(x: number, y: number, angle: number, length: number, width: number, depth: number) {
    if (depth <= 0 || length < 5) return;
    const wobble = (rand() - 0.5) * 0.5;
    const x2 = x + Math.cos(angle + wobble) * length;
    const y2 = y + Math.sin(angle + wobble) * length * 0.6;
    segments.push({
      x1: x,
      y1: y,
      x2,
      y2,
      width,
      opacity: 0.16 + (5 - depth) * 0.09,
    });
    const branchCount = depth > 2 && rand() < 0.75 ? 2 : 1;
    for (let b = 0; b < branchCount; b++) {
      const spread = (rand() - 0.5) * 1.0 + (b === 1 ? 0.45 : -0.1);
      grow(x2, y2, angle + spread, length * (0.66 + rand() * 0.18), width * 0.72, depth - 1);
    }
  }
  const mainBranches = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < mainBranches; i++) {
    const angle = (Math.PI * 2 * i) / mainBranches + (rand() - 0.5) * 0.8;
    grow(focalX, focalY, angle, 60 + rand() * 50, 3 + rand() * 1.5, 5);
  }
  return { segments };
}

/** Layered mountain/horizon silhouettes, like a distant range at dusk. */
function buildRidgeline(rand: () => number): Pick<RidgelineArt, "layers"> {
  const layerCount = 3;
  const layers = Array.from({ length: layerCount }, (_, layer) => {
    const baseY = VIEW_H * (0.58 + layer * 0.13);
    const amp = 34 + rand() * 40 - layer * 5;
    const segs = 8;
    const freq = 1.0 + rand() * 0.5;
    const phase = rand() * Math.PI * 2;
    const points: [number, number][] = Array.from({ length: segs + 1 }, (_, s) => {
      const x = (VIEW_W / segs) * s;
      const y = baseY - Math.abs(Math.sin(phase + s * freq)) * amp * (0.5 + rand() * 0.7);
      return [x, y];
    });
    const ridge = points.map(([x, y]) => `${x} ${y}`).join(" L ");
    return {
      d: `M 0 ${VIEW_H} L ${ridge} L ${VIEW_W} ${VIEW_H} Z`,
      opacity: 0.14 + layer * 0.12,
    };
  });
  return { layers };
}

/** A scattered flock of birds (chevrons) swirling around the focal point. */
function buildFlock(rand: () => number, focalX: number, focalY: number): Pick<FlockArt, "birds"> {
  const count = 16 + Math.floor(rand() * 14);
  const birds = Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = 20 + Math.pow(rand(), 0.6) * 260;
    const x = focalX + Math.cos(angle) * dist;
    const y = focalY + Math.sin(angle) * dist * 0.5;
    const heading = rand() * Math.PI * 2;
    const size = 4 + rand() * 5;
    const back1 = heading + Math.PI - 0.55;
    const back2 = heading + Math.PI + 0.55;
    const x1 = x + Math.cos(back1) * size;
    const y1 = y + Math.sin(back1) * size;
    const x2 = x + Math.cos(back2) * size;
    const y2 = y + Math.sin(back2) * size;
    return {
      d: `M ${x1} ${y1} L ${x} ${y} L ${x2} ${y2}`,
      opacity: 0.3 + rand() * 0.45,
    };
  });
  return { birds };
}

/** Even concentric rings emanating from the focal point, like water ripples. */
function buildRipples(rand: () => number): Pick<RipplesArt, "circles"> {
  const count = 5 + Math.floor(rand() * 4);
  const baseR = 20 + rand() * 20;
  const spacing = 22 + rand() * 18;
  const circles = Array.from({ length: count }, (_, i) => ({
    r: baseR + i * spacing + (rand() - 0.5) * 6,
    opacity: Math.max(0.05, 0.4 - i * 0.045),
    width: 1 + rand() * 1.2,
  }));
  return { circles };
}

/**
 * Deterministic per-update artwork — same update always renders the same
 * piece (effectively generated once, on publish) without needing to store
 * an image anywhere. The generative style itself (not just the color and
 * layout) is picked from the seed, so different updates read as distinct
 * pieces rather than palette-swapped copies of one pattern.
 */
function buildArt(seed: string, type: UpdateType): Art {
  const rand = mulberry32(hashSeed(`${type}:${seed}`));
  const palette = PALETTES[type];
  const style = STYLES[Math.floor(rand() * STYLES.length)];

  const focalX = VIEW_W * (0.42 + rand() * 0.4);
  const focalY = VIEW_H * (0.4 + rand() * 0.25);
  const glowR = 240 + rand() * 90;

  const base: BaseArt = {
    style,
    bgFrom: palette.bgFrom,
    bgTo: palette.bgTo,
    glow: palette.glow,
    accent: palette.accent,
    glowCx: focalX,
    glowCy: focalY,
    glowR,
  };

  switch (style) {
    case "constellation":
      return { ...base, style, ...buildConstellation(rand, focalX, focalY) };
    case "contours":
      return { ...base, style, ...buildContours(rand) };
    case "halftone":
      return { ...base, style, ...buildHalftone(rand, focalX, focalY) };
    case "orbits":
      return { ...base, style, ...buildOrbits(rand, focalX, focalY) };
    case "branches":
      return { ...base, style, ...buildBranches(rand, focalX, focalY) };
    case "ridgeline":
      return { ...base, style, ...buildRidgeline(rand) };
    case "flock":
      return { ...base, style, ...buildFlock(rand, focalX, focalY) };
    case "ripples":
      return { ...base, style, ...buildRipples(rand) };
  }
}

function ArtMarks({ art }: { art: Art }) {
  switch (art.style) {
    case "constellation":
      return (
        <>
          {art.edges.map(([a, b], i) => (
            <line
              key={i}
              x1={art.nodes[a].x}
              y1={art.nodes[a].y}
              x2={art.nodes[b].x}
              y2={art.nodes[b].y}
              stroke={art.accent}
              strokeWidth={1.25}
              strokeOpacity={0.35}
            />
          ))}
          {art.nodes.map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={art.accent} fillOpacity={0.9} />
          ))}
        </>
      );
    case "contours":
      return (
        <>
          {art.lines.map((line, i) => (
            <path
              key={i}
              d={line.d}
              fill="none"
              stroke={art.accent}
              strokeWidth={line.width}
              strokeOpacity={line.opacity}
              strokeLinecap="round"
            />
          ))}
        </>
      );
    case "halftone":
      return (
        <>
          {art.dots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
              fill={art.accent}
              fillOpacity={dot.opacity}
            />
          ))}
        </>
      );
    case "orbits":
      return (
        <>
          {art.rings.map((ring, i) => (
            <path
              key={i}
              d={ring.d}
              fill="none"
              stroke={art.accent}
              strokeWidth={ring.width}
              strokeOpacity={ring.opacity}
              strokeLinecap="round"
            />
          ))}
        </>
      );
    case "branches":
      return (
        <>
          {art.segments.map((seg, i) => (
            <line
              key={i}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={art.accent}
              strokeWidth={seg.width}
              strokeOpacity={seg.opacity}
              strokeLinecap="round"
            />
          ))}
        </>
      );
    case "ridgeline":
      return (
        <>
          {art.layers.map((layer, i) => (
            <path key={i} d={layer.d} fill={art.accent} fillOpacity={layer.opacity} />
          ))}
        </>
      );
    case "flock":
      return (
        <>
          {art.birds.map((bird, i) => (
            <path
              key={i}
              d={bird.d}
              fill="none"
              stroke={art.accent}
              strokeWidth={1.4}
              strokeOpacity={bird.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </>
      );
    case "ripples":
      return (
        <>
          {art.circles.map((circle, i) => (
            <circle
              key={i}
              cx={art.glowCx}
              cy={art.glowCy}
              r={circle.r}
              fill="none"
              stroke={art.accent}
              strokeWidth={circle.width}
              strokeOpacity={circle.opacity}
            />
          ))}
        </>
      );
  }
}

/**
 * Full-bleed, procedurally generated banner for an update's detail page.
 * Fades to transparent at the bottom via a CSS mask on the *container* (not
 * baked into the SVG) — the banner is wider than it is tall, so an
 * SVG-internal fade tied to the viewBox gets cropped away by
 * `preserveAspectRatio="slice"` at very wide aspect ratios; a CSS mask
 * always anchors to the actual rendered pixels instead.
 */
export function UpdateArtBanner({
  seed,
  type,
  title,
  className,
}: {
  seed: string;
  type: UpdateType;
  title: string;
  className?: string;
}) {
  const t = useTranslations("Updates");
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const art = useMemo(() => buildArt(seed, type), [seed, type]);

  function handleDownload() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    try {
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = VIEW_W * scale;
        canvas.height = VIEW_H * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const dlUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = dlUrl;
          a.download = `${slugify(title, "update")}-art.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(dlUrl);
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast.error(t("downloadArtError"));
      };
      img.src = url;
    } catch {
      toast.error(t("downloadArtError"));
    }
  }

  return (
    <div
      className={cn("group relative h-48 w-full overflow-hidden md:h-64 lg:h-72", className)}
      style={{
        maskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label={title}
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={art.bgFrom} />
            <stop offset="100%" stopColor={art.bgTo} />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={art.glow} stopOpacity="0.55" />
            <stop offset="100%" stopColor={art.glow} stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-blur`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="34" />
          </filter>
          <filter id={`${uid}-grain`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0" />
          </filter>
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill={`url(#${uid}-bg)`} />
        <circle
          cx={art.glowCx}
          cy={art.glowCy}
          r={art.glowR}
          fill={`url(#${uid}-glow)`}
          filter={`url(#${uid}-blur)`}
        />
        <ArtMarks art={art} />
        <rect width={VIEW_W} height={VIEW_H} filter={`url(#${uid}-grain)`} opacity={0.4} />
      </svg>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleDownload}
            aria-label={t("downloadArt")}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/30 text-white opacity-100 backdrop-blur-md transition-opacity duration-150 hover:bg-black/45 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          >
            <Download className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("downloadArt")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
