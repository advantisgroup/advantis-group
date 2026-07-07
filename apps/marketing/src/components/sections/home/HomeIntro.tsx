"use client";

import { useRef } from "react";

import { useInView } from "framer-motion";
import { useTranslations } from "next-intl";

export const HomeIntro = () => {
  const t = useTranslations("homeIntro");
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden py-16 md:py-20"
    >
      <div className="container relative z-10 mx-auto px-4">
        <div
          className={`mx-auto max-w-4xl space-y-4 text-center transition-[transform,opacity] duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ willChange: isVisible ? "auto" : "transform, opacity" }}
        >
          <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-primary/80">
            {t("eyebrow")}
          </p>
          <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
            {t("text")}
          </p>
        </div>
      </div>
    </section>
  );
};
