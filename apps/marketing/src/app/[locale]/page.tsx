"use client";

import { use, useEffect } from "react";

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

  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <HomeIntro />
      <HomeFeatures />
      <HomeServices />
      <HomeBrands />
      <TrustBadges />
      <HomeCTA />
    </div>
  );
}
