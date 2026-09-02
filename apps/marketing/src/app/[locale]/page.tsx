"use client";

import { use, useEffect } from "react";

import { PageField } from "@/components/frame";
import { Hero } from "@/components/sections/home/Hero";
import { HomeBrands } from "@/components/sections/home/HomeBrands";
import { HomeCTA } from "@/components/sections/home/HomeCTA";
import { HomeFeatures } from "@/components/sections/home/HomeFeatures";
import { HomeIntro } from "@/components/sections/home/HomeIntro";
import { HomeServices } from "@/components/sections/home/HomeServices";
import { TrustBadges } from "@/components/sections/home/TrustBadges";

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);

  useEffect(() => {
    window.localStorage.setItem("NEXT_LOCALE", locale);
  }, [locale]);

  /*
   * `PageField` draws the column rules and the hero wash once for the whole
   * document, behind every section — the rules run unbroken from the header to
   * the footer, and the wash fades out gradually across the sections under the
   * hero instead of stopping at its edge.
   *
   * Section order is also the argument: who we are, what we do, why us, the
   * brands that deliver it, the proof, the ask. "Why us" sits after the
   * capability explorer so the claims land on a reader who already knows what
   * is being claimed about.
   */
  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <div className="relative">
        <Hero />
        <HomeIntro />
        <HomeServices />
        <HomeFeatures />
        <HomeBrands />
        <TrustBadges />
        <HomeCTA />
      </div>
    </div>
  );
}
