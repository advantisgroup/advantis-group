"use client";

import { Fragment, type ReactNode } from "react";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Rises into place the first time it scrolls into view. `delay` staggers
 * siblings; `onLoad` plays it on mount instead, for the first screen, which
 * is already in view before anything scrolls.
 */
export const Reveal = ({
  children,
  className,
  delay = 0,
  onLoad = false,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  onLoad?: boolean;
  as?: "div" | "li";
}) => {
  const reduced = useReducedMotion();
  const Tag = as === "li" ? motion.li : motion.div;

  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      {...(onLoad
        ? { animate: shown }
        : { whileInView: shown, viewport: { once: true, margin: "0px 0px -12% 0px" } })}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
};

/** A line of text that rises in one word at a time, on mount. */
export const RevealWords = ({
  text,
  delay = 0,
  className,
}: {
  text: string;
  delay?: number;
  className?: string;
}) => {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {text.split(" ").map((word, index) => (
        <Fragment key={index}>
          {index > 0 ? " " : null}
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: "0.4em", filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: delay + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
          >
            {word}
          </motion.span>
        </Fragment>
      ))}
    </span>
  );
};
