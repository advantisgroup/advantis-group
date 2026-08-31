"use client";

import { useState } from "react";

import { useClerk } from "@clerk/nextjs";
import { Pencil, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { PasskeySettingsCard } from "@/components/passkeys/PasskeySettingsCard";
import { ProfileEditorDialog } from "@/components/profile/ProfileEditorDialog";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { initials, roleLabel } from "@/lib/format";
import { profileColorStyle, profileGradientClass } from "@/lib/profile-gradient";
import { cn } from "@/lib/utils";

export default function SettingsAccountPage() {
  const t = useTranslations("Settings");
  const tRoles = useTranslations("Roles");
  const user = useCurrentUser();
  const clerk = useClerk();
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  return (
    <>
      <Card className="group overflow-hidden" data-tour="tour-settings-profile">
        <div
          className={cn("relative h-28", profileGradientClass(user.profileGradient))}
          style={profileColorStyle(user.profileColor)}
        >
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute right-3 top-3 shadow-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
            onClick={() => setProfileEditorOpen(true)}
            aria-label={t("editProfile")}
          >
            <Pencil className="size-4" />
          </Button>
        </div>
        <CardContent className="relative -mt-10 pb-5">
          <div className="grid gap-5 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)] md:items-end">
            <div className="min-w-0">
              <Avatar className="size-20 ring-4 ring-card">
                {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                  {initials(user.name, user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="mt-3 min-w-0">
                <h2 className="truncate font-display text-xl font-bold tracking-tight">
                  {user.name}
                </h2>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <Badge variant="muted" className="mt-1.5">
                  {roleLabel(user, tRoles)}
                </Badge>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 bg-muted/25 p-4 text-sm sm:grid-cols-2 md:mb-0">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("jobTitle")}</dt>
                <dd className="mt-0.5 font-medium">{user.jobTitle || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("department")}</dt>
                <dd className="mt-0.5 font-medium">{user.department || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("phone")}</dt>
                <dd className="mt-0.5 font-medium">{user.phone || "—"}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => setProfileEditorOpen(true)}
            >
              <Pencil className="size-3.5" />
              {t("editProfile")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => clerk.openUserProfile()}>
              <ShieldCheck className="size-3.5" />
              {t("manageAccount")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PasskeySettingsCard />

      <ProfileEditorDialog
        user={user}
        open={profileEditorOpen}
        onOpenChange={setProfileEditorOpen}
      />
    </>
  );
}
