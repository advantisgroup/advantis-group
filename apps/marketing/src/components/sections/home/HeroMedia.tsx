"use client";

import { useEffect, useState } from "react";

import Image from "next/image";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

const CONTAINER_MAX = 1200;
const CONTAINER_PAD_MD = 40;
const CONTAINER_PAD_SM = 20;
const MD_BREAKPOINT = 768;

/** Scroll distance, in px, over which the picture reaches the screen edges. */
const TRAVEL = 420;

/**
 * The homepage photograph, which widens to the screen edges as you scroll
 * past it — the move anthropic.com makes with its hero media.
 *
 * The gutter is measured rather than expressed as a percentage: the picture
 * starts flush with the text column above it, and that column's offset is
 * `(viewport - 1200) / 2 + padding`, which no single CSS length describes.
 * Interpolating a measured pixel value keeps the left edge exactly under the
 * headline at rest and exactly on the screen edge at full scroll.
 */
export const HeroMedia = ({ src, alt }: { src: string; alt: string }) => {
  const prefersReducedMotion = useReducedMotion();
  const [gutter, setGutter] = useState(CONTAINER_PAD_MD);

  useEffect(() => {
    const measure = () => {
      const pad = window.innerWidth >= MD_BREAKPOINT ? CONTAINER_PAD_MD : CONTAINER_PAD_SM;
      setGutter(Math.max(pad, (window.innerWidth - CONTAINER_MAX) / 2 + pad));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /*
   * Keyed to the page's own scroll, not to where the picture sits in the
   * viewport. Tracking the element meant the picture was already part-way
   * expanded on load — at rest its top is inside the first screen, so an
   * element-relative range starts half-consumed. From the top of the page it
   * is inset, flush with the headline above it; 420px later it has reached
   * the screen edges.
   */
  const { scrollY } = useScroll();

  const padding = useTransform(scrollY, [0, TRAVEL], [gutter, 0], { clamp: true });
  const radius = useTransform(scrollY, [0, TRAVEL], [12, 0], { clamp: true });

  if (prefersReducedMotion) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl md:aspect-[21/9]">
          <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" priority />
        </div>
      </div>
    );
  }

  return (
    <motion.div style={{ paddingLeft: padding, paddingRight: padding }} className="w-full">
      <motion.div
        style={{ borderRadius: radius }}
        className="relative aspect-[16/10] overflow-hidden md:aspect-[21/9]"
      >
        <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" priority />
      </motion.div>
    </motion.div>
  );
};
