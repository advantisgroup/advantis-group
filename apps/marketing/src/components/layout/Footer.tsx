"use client";

import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/Logo";
import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";
import { COMPANY_ADDRESS } from "@/lib/company";
import { isAuthRoute } from "@/lib/utils";

/* Sourced from BRANDS rather than re-typed, so the launch status is decided
   in exactly one place. */

/** How far the last letters of the wordmark travel, in px, at full progress. */
const MAX_LIFT = 40;
const LIFTED_LETTERS = 5;

const Column = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h2 className="text-[13px] font-semibold tracking-normal">{title}</h2>
    <ul className="mt-4 space-y-2.5">{children}</ul>
  </div>
);

const Row = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <li>
    <Link
      href={href}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  </li>
);

/**
 * The wordmark, with its last few letters lifting as the footer comes into
 * view. Kept — it is the one piece of theatre on the page and it earns the
 * spot, because by the time you see it you have finished reading.
 *
 * Split per word first, then per letter: the lift needs individual letters,
 * but letting them wrap freely broke the wordmark mid-word on a phone —
 * "ADVANTIS GROU / P". Each word is now its own nowrap group, so it can only
 * break at the space, and offsets are precomputed so each letter still knows
 * its position in the whole wordmark.
 */
const LiftingWordmark = ({ progress }: { progress: number }) => {
  const words = "ADVANTIS GROUP".split(" ");
  const total = words.join("").length;
  const offsets = words.reduce<number[]>(
    (acc, word, index) => [...acc, (acc[index] ?? 0) + word.length],
    [0],
  );

  const liftFor = (index: number) => {
    const start = total - LIFTED_LETTERS;
    if (index < start) return 0;
    return -(((index - start + 1) / LIFTED_LETTERS) * MAX_LIFT * progress);
  };

  return (
    // Sized in vw so it spans the screen at any width; the top padding is the lift's headroom.
    <div
      aria-label="ADVANTIS GROUP"
      className="overflow-x-clip pt-10 pb-4 text-center md:pt-14 md:pb-6"
    >
      <span
        aria-hidden
        className="block text-[11vw] font-extrabold leading-[0.8] tracking-[-0.055em] whitespace-nowrap"
      >
        {words.map((word, wordIndex) => (
          <span key={word} className="inline-block whitespace-nowrap">
            {word.split("").map((letter, index) => (
              <span
                key={`${word}_${index.toString()}`}
                className="inline-block transition-transform duration-300 ease-out"
                style={{ transform: `translateY(${liftFor(offsets[wordIndex] + index)}px)` }}
              >
                {letter}
              </span>
            ))}
            {wordIndex < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </div>
  );
};

/**
 * A directory, then the name set as big as the screen allows — the last thing
 * on every page, the way Discord signs off. The logo that used to rotate in
 * from the bottom-right corner is gone — two things competing for the same
 * corner of the same band, and the wordmark is the one that says the name.
 */
export const Footer = () => {
  const pathname = usePathname();
  const t = useTranslations();
  const footerRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const intranetUrl = useCompanyIntranetUrl();
  const { isSignedIn } = useUser();

  useEffect(() => {
    const onScroll = () => {
      const footer = footerRef.current;
      if (!footer) return;

      const intoFooter = window.scrollY + window.innerHeight - footer.offsetTop;
      setScrollProgress(Math.min(Math.max(intoFooter / footer.offsetHeight, 0), 1));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The auth cards have their own minimal shell — the marketing chrome
  // would otherwise occlude them (see AuthShell).
  if (isAuthRoute(pathname)) return null;

  const email = process.env.NEXT_PUBLIC_EMAIL_ADRESS;
  const phone = process.env.NEXT_PUBLIC_PHONE_NUMBER;

  const legal = [
    { label: t("nav.imprint"), path: "/imprint" },
    { label: t("nav.privacy"), path: "/privacy" },
    { label: t("nav.licenses"), path: "/licenses" },
    { label: t("nav.cookies"), path: "/cookies" },
  ];

  return (
    <footer ref={footerRef} data-print-hide className="border-t border-rule">
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-24 md:px-10 md:pt-32">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] md:gap-8">
          <div>
            <Link href="/" aria-label="ADVANTIS GROUP" className="inline-flex">
              <Logo height={18} />
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("footer.description")}
            </p>
          </div>

          <Column title={t("footer.quickLinks")}>
            <Row href="/about">{t("nav.about")}</Row>
            <Row href="/brands">{t("nav.brands")}</Row>
            <Row href="/team">{t("nav.team")}</Row>
            <Row href="/blog">{t("nav.blog")}</Row>
            <Row href="/whitepaper">{t("nav.whitepaper")}</Row>
            <Row href="/contact">{t("nav.contact")}</Row>
            {isSignedIn ? <Row href="/account/submissions">{t("auth.submissionsCta")}</Row> : null}
            {intranetUrl ? <Row href={intranetUrl}>{t("nav.intranet")}</Row> : null}
          </Column>

          <Column title={t("footer.ourBrands")}>
            {BRANDS.map((brand) =>
              brand.status === "live" ? (
                <Row key={brand.key} href={brand.url}>
                  {brand.name}
                </Row>
              ) : (
                <li key={brand.key} className="text-sm text-muted-foreground/70">
                  {brand.name}
                  <span className="ml-2 text-[11px]">{t("brands.comingSoon")}</span>
                </li>
              ),
            )}
          </Column>

          <Column title={t("footer.contact")}>
            {phone ? <Row href={`tel:${phone}`}>{phone}</Row> : null}
            {email ? <Row href={`mailto:${email}`}>{email}</Row> : null}
            <li className="text-sm leading-relaxed text-muted-foreground">{COMPANY_ADDRESS}</li>
          </Column>
        </div>

        <div className="mt-20 flex flex-col-reverse gap-4 border-t border-rule pt-8 md:flex-row md:items-center md:justify-between">
          <p className="text-[13px] text-muted-foreground">
            © {new Date().getFullYear().toString()} ADVANTIS GROUP. {t("footer.copyright")}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legal.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-16 md:mt-24">
        <LiftingWordmark progress={scrollProgress} />
      </div>
    </footer>
  );
};
