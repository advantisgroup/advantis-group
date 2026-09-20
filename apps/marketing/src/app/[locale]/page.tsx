import { ProcessSteps, Section } from "@/components/frame";
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
   * Section order is the argument: who we are, how the work runs, what we do,
   * why us, the brands that deliver it, the proof, the ask.
   *
   * "How it works" used to be a schematic crammed into the bottom of the
   * hero, where it competed with the headline for the first screen. It is a
   * section now, between the claim and the list of services, because that is
   * the question a reader has after the claim and before the list.
   */
  return (
    <div className="min-h-screen bg-background">
      <RememberLocale locale={locale} />

      <Hero />

      <Section size="loose">
        <ProcessSteps />
      </Section>

      <HomeServices />
      <HomeFeatures />
      {/* Never advertise a download that isn't in the repo yet — same gate as
          the /whitepaper page itself. */}
      {whitepaperExists() && <HomeWhitepaper />}
      <HomeBrands />
      <TrustBadges />
      <HomeCTA />
    </div>
  );
}
