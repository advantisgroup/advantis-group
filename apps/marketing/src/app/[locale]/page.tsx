import { PageField } from "@/components/frame";
import { RememberLocale } from "@/components/layout/RememberLocale";
import { Hero } from "@/components/sections/home/Hero";
import { HomeBrands } from "@/components/sections/home/HomeBrands";
import { HomeCTA } from "@/components/sections/home/HomeCTA";
import { HomeFeatures } from "@/components/sections/home/HomeFeatures";
import { HomeServices } from "@/components/sections/home/HomeServices";
import { HomeWhitepaper } from "@/components/sections/home/HomeWhitepaper";
import { TrustBadges } from "@/components/sections/home/TrustBadges";
import { whitepaperExists } from "@/lib/whitepaper";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  /*
   * `PageField` draws the boundary rules and the hero wash once for the whole
   * document, so the wash fades out gradually across the sections under the
   * hero instead of stopping at its edge.
   *
   * Section order is also the argument: who we are, what we do, why us, the
   * brands that deliver it, the proof, the ask. "Why us" sits after the
   * capability explorer so the claims land on a reader who already knows what
   * is being claimed about.
   */
  return (
    <div className="relative min-h-screen bg-background">
      <PageField animated />
      <RememberLocale locale={locale} />

      <div className="relative">
        <Hero />
        <HomeServices />
        <HomeFeatures />
        {/* Never advertise a download that isn't in the repo yet — same gate as
            the /whitepaper page itself. */}
        {whitepaperExists() && <HomeWhitepaper />}
        <HomeBrands />
        <TrustBadges />
        <HomeCTA />
      </div>
    </div>
  );
}
