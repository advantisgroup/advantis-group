"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAction, useMutation } from "convex/react";
import { ArrowLeft, Camera, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Switch } from "@/components/notifications/NotificationPreferences";
import { ProfileColorPicker } from "@/components/profile/ProfileColorPicker";
import { type CurrentUser, useCurrentUser } from "@/components/providers/current-user";
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

type TextField = "firstName" | "lastName" | "jobTitle" | "phone" | "dateOfBirth";

function fieldsOf(user: CurrentUser) {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    jobTitle: user.jobTitle ?? "",
    phone: user.phone ?? "",
    dateOfBirth: user.dateOfBirth ?? "",
    showBirthdayPublicly: user.showBirthdayPublicly,
    profileColor: user.profileColor,
    profileGradient: user.profileGradient,
  };
}

type ProfileFields = ReturnType<typeof fieldsOf>;

/**
 * Like every other settings page, nothing here waits for a Save button:
 * clicks save straight away, text saves when you leave the field, and the
 * header quietly says when it's done.
 */
export default function EditProfilePage() {
  const t = useTranslations("Settings");
  const user = useCurrentUser();
  const updateProfile = useAction(api.people.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();
  const [fields, setFields] = useState<ProfileFields>(() => fieldsOf(user));
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  // Saves run one after another so a slow earlier save can't land on top of a newer one.
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const colorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  useEffect(() => () => clearTimeout(colorTimer.current), []);

  function persist(next: ProfileFields, avatarBlob?: Blob) {
    clearTimeout(colorTimer.current);
    pending.current += 1;
    setStatus("saving");
    queue.current = queue.current
      .then(async () => {
        const avatarStorageId = avatarBlob
          ? await uploadToConvex(
              () => generateUploadUrl({}),
              new File([avatarBlob], "avatar.jpg", { type: "image/jpeg" }),
            )
          : undefined;
        await updateProfile({ ...next, avatarStorageId });
      })
      .then(
        () => {
          pending.current -= 1;
          if (pending.current === 0) setStatus("saved");
        },
        (error) => {
          pending.current -= 1;
          setStatus("idle");
          handleError(error);
        },
      );
  }

  function change(patch: Partial<ProfileFields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    persist(next);
  }

  function changeColor(profileColor: string) {
    const next = { ...fields, profileColor };
    setFields(next);
    clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(() => persist(next), 500);
  }

  function textProps(field: TextField) {
    return {
      value: fields[field],
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setFields({ ...fields, [field]: event.target.value }),
      onBlur: () => {
        if (fields[field] !== fieldsOf(user)[field]) persist(fields);
      },
    };
  }

  async function onAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const blob = await cropToSquare(file);
      setAvatarPreview(URL.createObjectURL(blob));
      persist(fields, blob);
    } catch (error) {
      handleError(error);
    }
  }

  const avatarUrl = avatarPreview ?? user.avatar;
  const displayName =
    [fields.firstName, fields.lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ") || user.name;
  const subtitle = [fields.jobTitle.trim(), user.department].filter(Boolean).join(" · ");

  return (
    <div className="@container">
      <Link
        href="/settings/account"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("account")}
      </Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight">{t("editProfile")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("editProfileHint")}</p>
        </div>
        <p
          aria-live="polite"
          className="flex h-5 items-center gap-1.5 text-[13px] text-muted-foreground"
        >
          {status === "saving" && (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {t("saving")}
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="size-3.5 text-ok" />
              {t("saved")}
            </>
          )}
        </p>
      </header>

      <div className="mt-8 grid items-start gap-10 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
        <aside className="space-y-2.5 @3xl:sticky @3xl:top-24 @3xl:order-last">
          <p className="text-[12px] font-medium text-muted-foreground">{t("profilePreview")}</p>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div
              className={cn("h-20", profileGradientClass(fields.profileGradient))}
              style={profileColorStyle(fields.profileColor)}
            />
            <div className="-mt-9 px-4 pb-4">
              <Avatar className="size-16 ring-4 ring-card">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                  {initials(displayName, user.email)}
                </AvatarFallback>
              </Avatar>
              <p className="mt-2.5 break-words font-display text-base font-semibold leading-tight tracking-tight">
                {displayName}
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
                    {initials(displayName, user.email)}
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
                  const selected = !fields.profileColor && fields.profileGradient === gradient;
                  return (
                    <button
                      key={gradient}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        if (!selected) change({ profileGradient: gradient, profileColor: null });
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
                <ProfileColorPicker value={fields.profileColor} onChange={changeColor} />
              </div>
            </SettingsSection>

            <SettingsSection title={t("personalInfo")}>
              <div className="grid gap-4 p-4 @lg:grid-cols-2 sm:p-5">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-first-name">{t("firstName")}</Label>
                  <Input
                    id="profile-first-name"
                    autoComplete="given-name"
                    {...textProps("firstName")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-last-name">{t("lastName")}</Label>
                  <Input
                    id="profile-last-name"
                    autoComplete="family-name"
                    {...textProps("lastName")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-job-title">{t("jobTitle")}</Label>
                  <Input
                    id="profile-job-title"
                    autoComplete="organization-title"
                    {...textProps("jobTitle")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone">{t("phone")}</Label>
                  <Input id="profile-phone" type="tel" autoComplete="tel" {...textProps("phone")} />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title={t("dateOfBirth")} description={t("dateOfBirthHint")}>
              <div className="space-y-1.5 p-4 sm:p-5">
                <Label htmlFor="profile-birthday">{t("dateOfBirth")}</Label>
                <Input
                  id="profile-birthday"
                  type="date"
                  className="@lg:max-w-60"
                  {...textProps("dateOfBirth")}
                />
              </div>
              <SettingsRow
                title={t("showBirthdayPublicly")}
                control={
                  <Switch
                    checked={fields.showBirthdayPublicly}
                    onToggle={() => change({ showBirthdayPublicly: !fields.showBirthdayPublicly })}
                    label={t("showBirthdayPublicly")}
                  />
                }
              />
            </SettingsSection>
          </div>
        </SettingsLayoutProvider>
      </div>
    </div>
  );
}
