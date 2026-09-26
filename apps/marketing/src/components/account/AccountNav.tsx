"use client";

import { useClerk } from "@clerk/nextjs";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  Inbox,
  Lock,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "overview", href: "/account", icon: Home },
  { key: "inquiries", href: "/account/submissions", icon: Inbox },
  { key: "profile", href: "/account/profile", icon: UserRound },
  { key: "security", href: "/account/profile/security", icon: ShieldCheck },
  { key: "preferences", href: "/account/preferences", icon: SlidersHorizontal },
  { key: "downloads", href: "/account/downloads", icon: Download },
  { key: "privacy", href: "/account/privacy", icon: Lock },
] as const;

const isCurrent = (pathname: string, href: string) =>
  href === "/account"
    ? pathname === href
    : href === "/account/profile"
      ? pathname === href || (pathname.startsWith(`${href}/`) && !pathname.includes("/security"))
      : pathname === href || pathname.startsWith(`${href}/`);

/**
 * Staff sign in with their work account, whose security (passkeys, MFA
 * policy) is managed and enforced by the intranet — so for them "Security"
 * points there instead of offering controls that would sidestep it.
 */
const useSections = () => {
  const intranetUrl = useCompanyIntranetUrl();
  return SECTIONS.map((section) =>
    section.key === "security" && intranetUrl
      ? { ...section, href: `${intranetUrl}/settings/account`, external: true }
      : { ...section, external: false },
  );
};

const useSignOut = () => {
  const { signOut } = useClerk();
  const locale = useLocale();
  const t = useTranslations("account.nav");
  return async () => {
    await signOut({ redirectUrl: `/${locale}` });
    toast(t("signedOut"));
  };
};

/** The rail beside every account page, from `lg` up. */
export const AccountRail = () => {
  const t = useTranslations("account.nav");
  const pathname = usePathname();
  const sections = useSections();
  const signOut = useSignOut();

  return (
    <nav
      aria-label={t("label")}
      data-print-hide
      className="hidden lg:sticky lg:top-28 lg:block lg:self-start lg:transition-[top] lg:duration-300 lg:[[data-header-hidden]_&]:top-8"
    >
      <ul className="border-l border-rule">
        {sections.map(({ key, href, icon: Icon, external }) => {
          const current = !external && isCurrent(pathname, href);
          const className = cn(
            "-ml-px flex items-center gap-2.5 border-l py-2 pl-4 pr-2 text-[15px] whitespace-nowrap transition-colors",
            current
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          );
          return (
            <li key={key}>
              {external ? (
                <a href={href} className={className}>
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {t(key)}
                  <ArrowUpRight aria-hidden className="size-3.5 text-muted-foreground" />
                </a>
              ) : (
                <Link href={href} aria-current={current ? "page" : undefined} className={className}>
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {t(key)}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-6 flex items-center gap-2.5 pl-4 text-[15px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <LogOut aria-hidden className="size-4" />
        {t("signOut")}
      </button>
    </nav>
  );
};

/** On a phone the overview doubles as the menu: one row per section. */
export const AccountSectionList = () => {
  const t = useTranslations("account.nav");
  const sections = useSections().filter((section) => section.key !== "overview");
  const signOut = useSignOut();

  const row = "flex items-center gap-3 py-4 text-[15px] text-foreground";
  return (
    <nav aria-label={t("label")} className="lg:hidden">
      <ul className="divide-y divide-rule border-y border-rule">
        {sections.map(({ key, href, icon: Icon, external }) => (
          <li key={key}>
            {external ? (
              <a href={href} className={row}>
                <Icon aria-hidden className="size-4 text-muted-foreground" />
                <span className="flex-1">{t(key)}</span>
                <ArrowUpRight aria-hidden className="size-4 text-muted-foreground" />
              </a>
            ) : (
              <Link href={href} className={row}>
                <Icon aria-hidden className="size-4 text-muted-foreground" />
                <span className="flex-1">{t(key)}</span>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </Link>
            )}
          </li>
        ))}
        <li>
          <button type="button" onClick={() => void signOut()} className={cn(row, "w-full")}>
            <LogOut aria-hidden className="size-4 text-muted-foreground" />
            <span className="flex-1 text-left">{t("signOut")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
};

/** Back to the account menu, on a phone where there is no rail. */
export const AccountBackLink = ({
  href = "/account",
  label,
}: {
  href?: string;
  label?: string;
}) => {
  const t = useTranslations("account.nav");
  return (
    <Link
      href={href}
      data-print-hide
      className={cn(
        "mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
        href === "/account" && "lg:hidden",
      )}
    >
      <ChevronLeft aria-hidden className="size-3.5" />
      {label ?? t("back")}
    </Link>
  );
};
