"use client";

import { useEffect, useRef, useState } from "react";

import Image from "next/image";

import { Mail, Phone, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { useSingleLetterLogo } from "@/hooks/use-logo";
import { Link } from "@/i18n/navigation";

import { SectionDivider } from "./SectionDivider";
import { BrandText } from "../effects/BrandText";

export const Footer = () => {
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
      const progress = Math.min(
        Math.max(scrollIntoFooter / footerHeight, 0),
        1
      );
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
      label: t("nav.team"),
      path: "/team",
    },
    {
      label: t("nav.contact"),
      path: "/contact",
    },
    ...(intranetUrl
      ? [
          {
            label: t("nav.intranet"),
            path: intranetUrl,
          },
        ]
      : []),
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
    const liftAmount =
      ((liftIndex + 1) / lettersToLift) * maxLift * scrollProgress;

    return -liftAmount; // Negative to lift up
  };

  const companyName = "ADVANTIS GROUP";
  const letters = companyName.split("");

  return (
    <>
      <SectionDivider variant="curve" opacity={0.35} />
      <footer
        ref={footerRef}
        className="relative border-t border-white/50 bg-card overflow-hidden"
      >
        <div className="container mx-auto px-4 py-24 relative">
          {/* Large animated company name */}
          <div className="mb-24 overflow-hidden">
            <div className="text-center mb-4">
              <p className="text-sm text-muted-foreground">
                {t("footer.description")}
              </p>
            </div>
            <h2 className="text-[11vw] md:text-[12vw] lg:text-[8rem] font-bold leading-none tracking-tighter text-center">
              {letters.map((letter, index) => (
                <span
                  key={index}
                  className="inline-block transition-transform duration-300 ease-out"
                  style={{
                    transform: `translateY(${getLiftAmount(index, letters.length)}px)`,
                  }}
                >
                  {letter === " " ? "\u00A0" : letter}
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
              <h3 className="text-sm font-semibold">
                {t("footer.quickLinks")}
              </h3>
              <ul className="space-y-3 text-sm">
                {footerLinks.map((link, i) => (
                  <li key={`${link.label}_${i}`}>
                    <Link
                      href={link.path}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{t("footer.ourBrands")}</h3>
              <ul className="space-y-3 text-sm">
                {brandLinks.map((brand, i) => (
                  <li key={`${brand.name}_${i}`}>
                    <Link
                      href={brand.url}
                      className="text-muted-foreground hover:text-foreground transition-colors"
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
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{process.env.NEXT_PUBLIC_PHONE_NUMBER}</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{process.env.NEXT_PUBLIC_EMAIL_ADRESS}</span>
                  </Link>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{process.env.NEXT_PUBLIC_ADRESS}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-border">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear().toString()}{" "}
                <BrandText brand="advantis">advantis</BrandText> GmbH.{" "}
                {t("footer.copyright")}
              </p>
              <div className="flex items-center gap-6">
                <Link
                  href="/imprint"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav.imprint")}
                </Link>
                <Link
                  href="/privacy"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav.privacy")}
                </Link>
                <Link
                  href="/licenses"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav.licenses")}
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
            <Image
              src={logo}
              alt="Advantis Logo"
              fill
              className="object-contain"
            />
          </div>
        </div>
      </footer>
    </>
  );
};
