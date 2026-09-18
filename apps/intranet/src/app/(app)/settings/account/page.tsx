"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useClerk } from "@clerk/nextjs";
import { useConvex } from "convex/react";
import { Briefcase, Building2, Download, LogOut, Pencil, Phone, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";

import { Link } from "@/components/Link";
import { TotpSettingsCard } from "@/components/mfa/TotpSettingsCard";
import { PasskeySettingsCard } from "@/components/passkeys/PasskeySettingsCard";
import { ActiveSessionsCard } from "@/components/security/ActiveSessionsCard";
import { SecondaryEmailsCard } from "@/components/security/SecondaryEmailsCard";
import { SecurityActivityCard } from "@/components/security/SecurityActivityCard";
import { SecurityPosture } from "@/components/security/SecurityPosture";
import { SecurityPreferencesCard } from "@/components/security/SecurityPreferencesCard";
import { SecurityStateProvider } from "@/components/security/security-state";
import { TrustedDevicesCard } from "@/components/security/TrustedDevicesCard";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  SettingsLayoutProvider,
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { downloadFile, toJson } from "@/lib/activity/export";
import { initials, roleLabel } from "@/lib/format";

export default function SettingsAccountPage() {
  const t = useTranslations("Settings");
  const tRoles = useTranslations("Roles");
  const tNav = useTranslations("Nav");
  const user = useCurrentUser();
  const clerk = useClerk();
  const convex = useConvex();
  const handleError = useErrorHandler();
  const [exporting, setExporting] = useState(false);

  async function downloadMyData() {
    setExporting(true);
    try {
      const data = await convex.query(api.users.exportMine, {});
      downloadFile(
        `intranet-data_${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
        toJson(data),
      );
    } catch (error) {
      handleError(error);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {/* Who you are and the two ways to change it, in one block — the heading-in-a-far-left-column
      treatment the rest of settings uses put the name of this section a long way from the person it
      describes. */}
      <section
        data-tour="tour-settings-profile"
        className="overflow-hidden rounded-2xl border border-border/70 bg-card"
      >
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Avatar className="size-14">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
              {initials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-[12rem] flex-1">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight">
              {user.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <span className="truncate">{user.email}</span>
              <span aria-hidden>·</span>
              <span>{roleLabel(user, tRoles)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/account/profile">
                <Pencil />
                {t("editProfile")}
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clerk.openUserProfile()}>
              <ShieldCheck />
              {t("manageAccount")}
            </Button>
          </div>
        </div>
        <dl className="grid divide-y divide-border/60 border-t border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { icon: Briefcase, label: t("jobTitle"), value: user.jobTitle },
            { icon: Building2, label: t("department"), value: user.department },
            { icon: Phone, label: t("phone"), value: user.phone },
          ].map((row) => (
            <div key={row.label} className="min-w-0 px-5 py-3.5">
              <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <row.icon className="size-3.5" />
                {row.label}
              </dt>
              <dd className="mt-0.5 truncate text-[13.5px]">{row.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      {/* This page is mostly things to read and occasionally act on, so its
          groups keep their heading directly above their rows instead of in a
          column of its own — see `SettingsLayoutProvider`. */}
      <SettingsLayoutProvider value="stacked">
        {/* One provider around all four so the posture header and the cards
            under it can never describe different accounts. */}
        <SecurityStateProvider>
          <SecurityPosture />
          <PasskeySettingsCard />
          <TotpSettingsCard />
          <SecondaryEmailsCard />
          <SecurityPreferencesCard />
        </SecurityStateProvider>

        {/* Outside the provider: both read from Clerk and Convex directly, not
            from the credential state the cards above share. */}
        <ActiveSessionsCard />
        <TrustedDevicesCard />

        <SecurityActivityCard />

        <SettingsSection title={t("sessionTitle")} description={t("sessionHint")}>
          <SettingsRow
            title={t("signOutTitle")}
            description={t("signOutHint")}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  posthog.reset();
                  void clerk.signOut({ redirectUrl: "/sign-in" });
                }}
              >
                <LogOut />
                {tNav("signOut")}
              </Button>
            }
          />
          <SettingsRow
            title={t("exportDataTitle")}
            description={t("exportDataHint")}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={exporting}
                onClick={() => void downloadMyData()}
              >
                <Download />
                {t("exportDataAction")}
              </Button>
            }
          />
          <SettingsRow title={t("deleteAccountTitle")} description={t("deleteAccountHint")} />
        </SettingsSection>
      </SettingsLayoutProvider>
    </>
  );
}
