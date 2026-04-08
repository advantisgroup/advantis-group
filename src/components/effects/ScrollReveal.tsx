"use client";

import React, { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  stagger?: boolean;
  staggerDelay?: number;
  threshold?: number;
}

export const ScrollReveal = ({
  children,
  className,
  delay = 0,
  direction = "up",
  stagger = false,
  staggerDelay = 100,
  threshold = 0.1,
}: ScrollRevealProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReducedMotion(true);
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    const node = ref.current;
    if (node) {
      observer.observe(node);
    }

    return () => {
      if (node) {
        observer.unobserve(node);
      }
    };
  }, [threshold]);

  const getDirectionClasses = () => {
    if (direction === "none" || reducedMotion) return "";

    const baseClasses = "transition-[transform,opacity] duration-700 ease-out";
    const hiddenClasses = {
      up: "translate-y-8 opacity-0",
      down: "-translate-y-8 opacity-0",
      left: "translate-x-8 opacity-0",
      right: "-translate-x-8 opacity-0",
    };
    const visibleClasses = "translate-y-0 translate-x-0 opacity-100";

    return cn(
      baseClasses,
      !isVisible && hiddenClasses[direction],
      isVisible && visibleClasses
    );
  };

  return (
    <div
      ref={ref}
      className={cn(getDirectionClasses(), className)}
      style={{
        transitionDelay: reducedMotion ? "0ms" : `${delay}ms`,
        willChange: isVisible ? "auto" : "transform, opacity",
      }}
    >
      {stagger && Array.isArray(children)
        ? children.map((child, index) => (
            <div
              key={index}
              className={cn(
                !reducedMotion &&
                  "transition-[transform,opacity] duration-700 ease-out",
                !reducedMotion && !isVisible && "translate-y-8 opacity-0",
                (reducedMotion || isVisible) && "translate-y-0 opacity-100"
              )}
              style={{
                transitionDelay: reducedMotion
                  ? "0ms"
                  : `${delay + index * staggerDelay}ms`,
                willChange: isVisible ? "auto" : "transform, opacity",
              }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
};
