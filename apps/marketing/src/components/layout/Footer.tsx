"use client";

import { useEffect, useRef, useState } from "react";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { Building2, Mail, Phone, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { useSingleLetterLogo } from "@/hooks/use-logo";
import { Link } from "@/i18n/navigation";
import { COMPANY_ADDRESS } from "@/lib/company";
import { isAuthRoute } from "@/lib/utils";

export const Footer = () => {
  const pathname = usePathname();
  const t = useTranslations();
  const footerRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const logo = useSingleLetterLogo();
  const intranetUrl = useCompanyIntranetUrl();

  useEffect(() => {
    const handleScroll = () => {
      if (!footerRef.current) return;

      const footerTop = footerRef.current.offsetTop;
      const windowHeight = window.innerHeight;
      const scrollY = window.scrollY;

      // Calculate how far into the footer we've scrolled
      const scrollIntoFooter = scrollY + windowHeight - footerTop;
      const footerHeight = footerRef.current.offsetHeight;

      // Progress from 0 to 1 as we scroll through the footer
      const progress = Math.min(Math.max(scrollIntoFooter / footerHeight, 0), 1);
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // The auth cards have their own minimal shell — the marketing chrome
  // would otherwise occlude them (see AuthShell).
  if (isAuthRoute(pathname)) return null;

  const footerLinks = [
    {
      label: t("nav.home"),
      path: "/",
    },
    {
      label: t("nav.about"),
      path: "/about",
    },
    {
      label: t("nav.brands"),
      path: "/brands",
    },
    {
      label: t("nav.blog"),
      path: "/blog",
    },
    {
      label: t("nav.team"),
      path: "/team",
    },
    {
      label: t("nav.whitepaper"),
      path: "/whitepaper",
    },
    {
      label: t("nav.contact"),
      path: "/contact",
    },
  ];

  const brandLinks = [
    {
      name: "Salespirates",
      url: "https://salespirates.de",
    },
    {
      name: "Rodeo-Consulting",
      url: "https://rodeoconsulting.de",
    },
    {
      name: "Oldschool-train",
      url: "https://oldschool-train.de",
    },
    {
      name: "Sales-AI-Germany",
      url: "https://sales-ai-germany.de",
    },
  ];

  const getLiftAmount = (index: number, totalLetters: number) => {
    const lettersToLift = 5;
    const startIndex = totalLetters - lettersToLift;

    if (index < startIndex) return 0;

    const liftIndex = index - startIndex;
    const maxLift = 40;
    const liftAmount = ((liftIndex + 1) / lettersToLift) * maxLift * scrollProgress;

    return -liftAmount; // Negative to lift up
  };

  /*
   * Split per word first, then per letter. The lift effect needs individual
   * letters, but letting them wrap freely broke the wordmark mid-word on a
   * phone — "ADVANTIS GROU / P". Each word is now its own nowrap group, so it
   * can only ever break at the space. Offsets are precomputed so each letter
   * still knows its position in the whole wordmark.
   */
  const companyWords = "ADVANTIS GROUP".split(" ");
  const totalLetters = companyWords.join("").length;
  const wordOffsets = companyWords.reduce<number[]>(
    (acc, word, index) => [...acc, (acc[index] ?? 0) + word.length],
    [0],
  );

  return (
    <>
      <footer ref={footerRef} className="relative overflow-hidden border-t border-rule bg-card">
        <div className="relative z-20 mx-auto w-full max-w-[1440px] px-5 py-24 md:px-10">
          {/* Large animated company name */}
          <div className="mb-24 overflow-hidden">
            <div className="text-center mb-4">
              <p className="text-sm text-muted-foreground">{t("footer.description")}</p>
            </div>
            <h2 className="text-center text-[13vw] font-bold leading-none tracking-tighter md:text-[12vw] lg:text-[8rem]">
              {companyWords.map((word, wordIndex) => (
                <span key={word} className="inline-block whitespace-nowrap">
                  {word.split("").map((letter, index) => (
                    <span
                      key={`${word}_${index}`}
                      className="inline-block transition-transform duration-300 ease-out"
                      style={{
                        transform: `translateY(${getLiftAmount(
                          wordOffsets[wordIndex] + index,
                          totalLetters,
                        )}px)`,
                      }}
                    >
                      {letter}
                    </span>
                  ))}
                  {wordIndex < companyWords.length - 1 ? "\u00A0" : null}
                </span>
              ))}
            </h2>
          </div>

          {/* Main footer grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-10 mb-12">
            {/* Company Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{t("nav.about")}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("footer.description")}
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{t("footer.quickLinks")}</h3>
              <ul className="space-y-3 text-sm">
                {footerLinks.map((link, i) => (
                  <li key={`${link.label}_${i}`}>
                    <Link
                      href={link.path}
                      className="block py-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                {intranetUrl && (
                  <li>
                    <Link
                      href={intranetUrl}
                      className="group/intranet relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-advantis/30 bg-advantis/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-advantis transition-colors hover:bg-advantis/20"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{t("nav.intranet")}</span>
                      <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover/intranet:translate-x-full" />
                    </Link>
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{t("footer.ourBrands")}</h3>
              <ul className="space-y-3 text-sm">
                {brandLinks.map((brand, i) => (
                  <li key={`${brand.name}_${i}`}>
                    <Link
                      href={brand.url}
                      className="block py-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {brand.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{t("footer.contact")}</h3>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link
                    href={`tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`}
                    className="flex items-center gap-2 py-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{process.env.NEXT_PUBLIC_PHONE_NUMBER}</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}
                    className="flex items-center gap-2 py-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{process.env.NEXT_PUBLIC_EMAIL_ADRESS}</span>
                  </Link>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{COMPANY_ADDRESS}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-rule pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear().toString()} ADVANTIS GROUP. {t("footer.copyright")}
              </p>
              {/* Wraps: four links at 375px overflowed the row. */}
              <div className="flex flex-wrap items-center justify-center gap-x-6">
                <Link
                  href="/imprint"
                  className="inline-block py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav.imprint")}
                </Link>
                <Link
                  href="/privacy"
                  className="inline-block py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav.privacy")}
                </Link>
                <Link
                  href="/licenses"
                  className="inline-block py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav.licenses")}
                </Link>
                <Link
                  href="/cookies"
                  className="inline-block py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav.cookies")}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Peeking Logo */}
        <div
          className="absolute right-0 bottom-0 pointer-events-none transition-transform duration-500 ease-out z-10"
          style={{
            transform: `translateX(${35 + (1 - scrollProgress) * 80}%) rotate(-${scrollProgress * 40}deg)`,
            opacity: Math.min(1, Math.max(0, (scrollProgress - 0.7) * 3)),
          }}
        >
          <div className="relative w-32 h-32 md:w-48 md:h-48 ">
            <Image src={logo} alt="Advantis Logo" fill className="object-contain" />
          </div>
        </div>
      </footer>
    </>
  );
};
