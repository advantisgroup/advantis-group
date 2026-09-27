import { type Metadata } from "next";

import { RememberLocale } from "@/components/layout/RememberLocale";
import { Hero } from "@/components/sections/home/Hero";
import { HomeBrands } from "@/components/sections/home/HomeBrands";
import { HomeCTA } from "@/components/sections/home/HomeCTA";
import { HomeFeatures } from "@/components/sections/home/HomeFeatures";
import { HomeProcess } from "@/components/sections/home/HomeProcess";
import { HomeServices } from "@/components/sections/home/HomeServices";
import { HomeTeam } from "@/components/sections/home/HomeTeam";
import { HomeWhitepaper } from "@/components/sections/home/HomeWhitepaper";
import { TrustBadges } from "@/components/sections/home/TrustBadges";
import { localeAlternates } from "@/lib/seo";
import { whitepaperExists } from "@/lib/whitepaper";

// Set here rather than on the root layout, which would make every page
// without its own alternates canonical to the home page.
// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return { alternates: localeAlternates(locale) };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  /*
   * Section order is the argument: who we are, how the work runs, what we do,
   * why us, the proof, who you'll deal with, the brands that deliver it, the
   * ask.
   *
   * The grounds alternate (paper, ink, raised) so the page changes pace as it
   * goes. When every section sat on the same paper under the same centred
   * heading, everything below the hero read as one long section.
   */
  return (
    <div className="min-h-screen bg-background">
      <RememberLocale locale={locale} />

      <Hero />
      <HomeProcess />
      <HomeServices />
      <HomeFeatures />
      <TrustBadges />
      <HomeTeam />
      <HomeBrands />
      {/* Never advertise a download that isn't in the repo yet — same gate as
          the /whitepaper page itself. */}
      {whitepaperExists() && <HomeWhitepaper />}
      <HomeCTA />
    </div>
  );
}
