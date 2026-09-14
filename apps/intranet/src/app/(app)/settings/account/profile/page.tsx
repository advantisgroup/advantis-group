"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction, useMutation } from "convex/react";
import { ArrowLeft, Camera, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Switch } from "@/components/notifications/NotificationPreferences";
import { ProfileColorPicker } from "@/components/profile/ProfileColorPicker";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SettingsLayoutProvider,
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cropToSquare } from "@/lib/image";
import {
  PROFILE_GRADIENTS,
  profileColorStyle,
  profileGradientClass,
  type ProfileGradient,
} from "@/lib/profile-gradient";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

export default function EditProfilePage() {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const user = useCurrentUser();
  const router = useRouter();
  const updateProfile = useAction(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth ?? "");
  const [showBirthdayPublicly, setShowBirthdayPublicly] = useState(user.showBirthdayPublicly);
  const [profileColor, setProfileColor] = useState<string | null>(user.profileColor);
  const [profileGradient, setProfileGradient] = useState<ProfileGradient>(user.profileGradient);
  const [avatarPreview, setAvatarPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview.url);
    },
    [avatarPreview],
  );

  const dirty =
    avatarPreview !== null ||
    firstName !== (user.firstName ?? "") ||
    lastName !== (user.lastName ?? "") ||
    jobTitle !== (user.jobTitle ?? "") ||
    phone !== (user.phone ?? "") ||
    dateOfBirth !== (user.dateOfBirth ?? "") ||
    showBirthdayPublicly !== user.showBirthdayPublicly ||
    profileColor !== user.profileColor ||
    profileGradient !== user.profileGradient;

  const avatarUrl = avatarPreview?.url ?? user.avatar;
  const displayName = [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
  const subtitle = [jobTitle.trim(), user.department].filter(Boolean).join(" · ");

  async function onAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const blob = await cropToSquare(file);
      setAvatarPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (error) {
      handleError(error);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const avatarStorageId = avatarPreview
        ? await uploadToConvex(
            () => generateUploadUrl({}),
            new File([avatarPreview.blob], "avatar.jpg", { type: "image/jpeg" }),
          )
        : undefined;
      await updateProfile({
        firstName,
        lastName,
        jobTitle,
        phone,
        dateOfBirth,
        showBirthdayPublicly,
        profileColor,
        profileGradient,
        avatarStorageId,
      });
      toast.success(t("saved"));
      router.push("/settings/account");
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="@container">
      <Link
        href="/settings/account"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("account")}
      </Link>
      <header className="mt-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">{t("editProfile")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("editProfileHint")}</p>
      </header>

      <div className="mt-8 grid items-start gap-10 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
        <aside className="space-y-2.5 @3xl:sticky @3xl:top-6 @3xl:order-last">
          <p className="text-[12px] font-medium text-muted-foreground">{t("profilePreview")}</p>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div
              className={cn("h-20", profileGradientClass(profileGradient))}
              style={profileColorStyle(profileColor)}
            />
            <div className="-mt-9 px-4 pb-4">
              <Avatar className="size-16 ring-4 ring-card">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                  {initials(displayName || user.name, user.email)}
                </AvatarFallback>
              </Avatar>
              <p className="mt-2.5 break-words font-display text-base font-semibold leading-tight tracking-tight">
                {displayName || user.name}
              </p>
              {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
              <p className="mt-2 truncate text-[12.5px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </aside>

        <SettingsLayoutProvider value="stacked">
          <div className="space-y-8">
            <SettingsSection title={t("avatar")} description={t("avatarHint")}>
              <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <Avatar className="size-16">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name} />}
                  <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                    {initials(displayName || user.name, user.email)}
                  </AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <Camera />
                    {t("uploadAvatar")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void onAvatar(event)}
                    />
                  </label>
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title={t("profileGradient")} description={t("profileGradientHint")}>
              <div className="grid grid-cols-3 gap-x-3 gap-y-4 p-4 @lg:grid-cols-6 sm:p-5">
                {(Object.keys(PROFILE_GRADIENTS) as ProfileGradient[]).map((gradient) => {
                  const selected = !profileColor && profileGradient === gradient;
                  return (
                    <button
                      key={gradient}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setProfileGradient(gradient);
                        setProfileColor(null);
                      }}
                      className="group space-y-1.5 text-left focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "grid h-12 place-items-center rounded-lg bg-gradient-to-br ring-offset-2 ring-offset-card transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-ring",
                          PROFILE_GRADIENTS[gradient],
                          selected && "ring-2 ring-foreground",
                        )}
                      >
                        {selected && <Check className="size-4 text-white drop-shadow" />}
                      </span>
                      <span
                        className={cn(
                          "block text-[12.5px]",
                          selected ? "font-medium" : "text-muted-foreground",
                        )}
                      >
                        {t(`gradient_${gradient}`)}
                      </span>
                    </button>
                  );
                })}
                <ProfileColorPicker value={profileColor} onChange={setProfileColor} />
              </div>
            </SettingsSection>

            <SettingsSection title={t("personalInfo")}>
              <div className="grid gap-4 p-4 @lg:grid-cols-2 sm:p-5">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-first-name">{t("firstName")}</Label>
                  <Input
                    id="profile-first-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-last-name">{t("lastName")}</Label>
                  <Input
                    id="profile-last-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-job-title">{t("jobTitle")}</Label>
                  <Input
                    id="profile-job-title"
                    autoComplete="organization-title"
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone">{t("phone")}</Label>
                  <Input
                    id="profile-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title={t("dateOfBirth")} description={t("dateOfBirthHint")}>
              <div className="space-y-1.5 p-4 sm:p-5">
                <Label htmlFor="profile-birthday">{t("dateOfBirth")}</Label>
                <Input
                  id="profile-birthday"
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  className="@lg:max-w-60"
                />
              </div>
              <SettingsRow
                title={t("showBirthdayPublicly")}
                control={
                  <Switch
                    checked={showBirthdayPublicly}
                    onToggle={() => setShowBirthdayPublicly((value) => !value)}
                    label={t("showBirthdayPublicly")}
                  />
                }
              />
            </SettingsSection>
          </div>
        </SettingsLayoutProvider>
      </div>

      <div className="sticky bottom-0 z-10 mt-10 flex items-center justify-end gap-2 border-t border-border/60 bg-background/85 py-3 backdrop-blur">
        {dirty && (
          <p className="mr-auto text-[13px] text-muted-foreground">{t("unsavedChanges")}</p>
        )}
        <Button variant="ghost" asChild>
          <Link href="/settings/account">{tc("cancel")}</Link>
        </Button>
        <Button onClick={() => void save()} disabled={busy || !dirty}>
          {busy && <Loader2 className="animate-spin" />}
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
