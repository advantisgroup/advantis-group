import { RememberLocale } from "@/components/layout/RememberLocale";
import { Hero } from "@/components/sections/home/Hero";
import { HomeBrands } from "@/components/sections/home/HomeBrands";
import { HomeCTA } from "@/components/sections/home/HomeCTA";
import { HomeFeatures } from "@/components/sections/home/HomeFeatures";
import { HomeIntro } from "@/components/sections/home/HomeIntro";
import { HomeServices } from "@/components/sections/home/HomeServices";
import { HomeWhitepaper } from "@/components/sections/home/HomeWhitepaper";
import { TrustBadges } from "@/components/sections/home/TrustBadges";
import { whitepaperExists } from "@/lib/whitepaper";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <div className="min-h-screen bg-background">
      <RememberLocale locale={locale} />
      <Hero />
      <HomeIntro />
      <HomeFeatures />
      <HomeServices />
      {/* Never advertise a download that isn't in the repo yet — same gate as
          the /whitepaper page itself. */}
      {whitepaperExists() && <HomeWhitepaper />}
      <HomeBrands />
      <TrustBadges />
      <HomeCTA />
    </div>
  );
}
