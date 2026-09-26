"use client";

import { useState } from "react";

import { UserProfile, useUser } from "@clerk/nextjs";
import { ArrowUpRight, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { usePathname } from "@/i18n/navigation";
import type { AccountMetadata } from "@/lib/account";

import { AccountBackLink } from "./AccountNav";
import { CheckpointNote } from "./Checkpoints";

/*
 * Clerk's profile, sitting flat on our page: its own sidebar is hidden
 * (our rail already has Profile and Security) and the card chrome goes, so it
 * reads as part of the page rather than a widget dropped onto it.
 */
const APPEARANCE = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-none rounded-none border-0 bg-transparent shadow-none",
    navbar: "hidden",
    navbarMobileMenuRow: "hidden",
    scrollBox: "rounded-none bg-transparent shadow-none",
    pageScrollBox: "p-0",
    header: "hidden",
  },
  variables: { fontSize: "0.9375rem" },
};

export function ProfilePage() {
  const t = useTranslations("account.profile");
  const locale = useLocale();
  const pathname = usePathname();
  const intranetUrl = useCompanyIntranetUrl();
  const security = pathname.endsWith("/security");

  return (
    <div className="max-w-3xl">
      <AccountBackLink />
      <Display as="h1" size="md">
        {security ? t("securityTitle") : t("title")}
      </Display>

      {!security ? <BusinessDetails /> : null}

      {security && intranetUrl ? (
        // staff security (passkeys, MFA policy) is enforced by the intranet; offering
        // the same controls here would let someone sidestep it
        <CheckpointNote
          title={t("staffSecurity.title")}
          action={
            <a
              href={`${intranetUrl}/settings/account`}
              className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("staffSecurity.cta")}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          }
        >
          {t("staffSecurity.body")}
        </CheckpointNote>
      ) : (
        <section className="mt-12">
          {!security ? (
            <h2 className="mb-2 text-[15px] font-medium text-foreground">{t("signIn")}</h2>
          ) : null}
          {/* Clerk pads its page and bolds its section names; flatten both so its
              rows line up with the business details above and read the same. Its
              own "delete account" goes: that one only unlinks inquiries, while
              Privacy & data erases them, and there should be one way to do it. */}
          <div className="[&_.cl-profilePageContent]:p-0 [&_.cl-profileSection__danger]:hidden [&_.cl-profileSectionTitleText]:text-[15px] [&_.cl-profileSectionTitleText]:font-normal [&_.cl-profileSectionTitleText]:text-muted-foreground">
            <UserProfile
              path={`/${locale}/account/profile`}
              routing="path"
              appearance={APPEARANCE}
            />
          </div>
        </section>
      )}
    </div>
  );
}

const FIELDS = ["company", "phone", "role"] as const;

/**
 * Company, phone and role, which every contact form asks for again. Each
 * saves when you leave the field; the forms fill themselves in from here.
 */
function BusinessDetails() {
  const t = useTranslations("account.profile.details");
  const { user } = useUser();
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (!user) return null;
  const metadata = (user.unsafeMetadata ?? {}) as AccountMetadata;

  const save = async (field: (typeof FIELDS)[number], value: string) => {
    if ((metadata[field] ?? "") === value.trim()) return;
    try {
      await user.update({ unsafeMetadata: { ...metadata, [field]: value.trim() || undefined } });
      setFailed(false);
      setSaved(field);
      setTimeout(() => setSaved((current) => (current === field ? null : current)), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-[15px] font-medium text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <div className="mt-5 divide-y divide-rule border-y border-rule">
        {FIELDS.map((field) => (
          <label
            key={field}
            className="grid items-center gap-2 py-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:gap-6"
          >
            <span className="text-[15px] text-muted-foreground">{t(field)}</span>
            <input
              defaultValue={metadata[field] ?? ""}
              type={field === "phone" ? "tel" : "text"}
              autoComplete={
                field === "company"
                  ? "organization"
                  : field === "phone"
                    ? "tel"
                    : "organization-title"
              }
              maxLength={200}
              onBlur={(event) => void save(field, event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-[15px]"
            />
            <span
              aria-live="polite"
              className="flex h-5 min-w-14 items-center gap-1 text-[13px] text-muted-foreground"
            >
              {saved === field ? (
                <>
                  <Check aria-hidden className="size-3.5 text-success" />
                  {t("saved")}
                </>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {failed ? <p className="mt-2 text-sm text-destructive">{t("failed")}</p> : null}
    </section>
  );
}
