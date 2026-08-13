"use client";

import { UserProfile } from "@clerk/nextjs";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { PasskeySettingsCard } from "@/components/passkeys/PasskeySettingsCard";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

export function AccountProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Settings");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("manageAccount")}
      contentClassName="max-w-4xl"
    >
      <UserProfile routing="hash">
        <UserProfile.Page label={t("passkeys")} labelIcon={<KeyRound />} url="passkeys">
          <PasskeySettingsCard />
        </UserProfile.Page>
      </UserProfile>
    </ResponsiveDialog>
  );
}
