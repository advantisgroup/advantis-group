"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAction, useMutation } from "convex/react";
import { Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Switch } from "@/components/notifications/NotificationPreferences";
import { ProfileColorPicker } from "@/components/profile/ProfileColorPicker";
import type { CurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cropToSquare } from "@/lib/image";
import { PROFILE_GRADIENTS, type ProfileGradient } from "@/lib/profile-gradient";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function ProfileEditorDialog({
  user,
  open,
  onOpenChange,
}: {
  user: CurrentUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const updateProfile = useAction(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth ?? "");
  const [showBirthdayPublicly, setShowBirthdayPublicly] = useState(user.showBirthdayPublicly);
  const [profileColor, setProfileColor] = useState<string | null>(user.profileColor);
  const [profileGradient, setProfileGradient] = useState<ProfileGradient>(user.profileGradient);
  const [avatarPreview, setAvatarPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setJobTitle(user.jobTitle ?? "");
    setDepartment(user.department ?? "");
    setPhone(user.phone ?? "");
    setDateOfBirth(user.dateOfBirth ?? "");
    setShowBirthdayPublicly(user.showBirthdayPublicly);
    setProfileColor(user.profileColor);
    setProfileGradient(user.profileGradient);
    setAvatarPreview(null);
  }, [open, user]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview.url);
    },
    [avatarPreview],
  );

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
        department,
        phone,
        dateOfBirth,
        showBirthdayPublicly,
        profileColor,
        profileGradient,
        avatarStorageId,
      });
      toast.success(t("saved"));
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("editProfile")}
      description={t("editProfileHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button variant="violet" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <label className="group relative cursor-pointer">
          <Avatar className="size-20 ring-2 ring-background">
            {(avatarPreview?.url ?? user.avatar) && (
              <AvatarImage src={avatarPreview?.url ?? user.avatar ?? ""} alt={user.name} />
            )}
            <AvatarFallback className="text-xl">{initials(user.name, user.email)}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border border-border bg-card shadow-sm group-hover:bg-accent">
            <Camera className="size-4" />
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void onAvatar(event)}
          />
        </label>
        <p className="text-sm text-muted-foreground">{t("uploadAvatar")}</p>
      </div>

      <div className="space-y-3">
        <Label>{t("profileGradient")}</Label>
        <div className="grid grid-cols-5 gap-2">
          {(Object.keys(PROFILE_GRADIENTS) as ProfileGradient[]).map((gradient) => (
            <button
              key={gradient}
              type="button"
              aria-label={t(`gradient_${gradient}`)}
              aria-pressed={profileGradient === gradient}
              onClick={() => {
                setProfileGradient(gradient);
                setProfileColor(null);
              }}
              className={cn(
                "h-11 rounded-lg bg-gradient-to-br ring-offset-background transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                PROFILE_GRADIENTS[gradient],
                profileGradient === gradient && "scale-95 ring-2 ring-foreground ring-offset-2",
              )}
            />
          ))}
        </div>
        <ProfileColorPicker value={profileColor} onChange={setProfileColor} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("firstName")}</Label>
          <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("lastName")}</Label>
          <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("jobTitle")}</Label>
        <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("department")}</Label>
          <Input value={department} onChange={(event) => setDepartment(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("phone")}</Label>
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("dateOfBirth")}</Label>
        <Input
          type="date"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Switch
            checked={showBirthdayPublicly}
            onToggle={() => setShowBirthdayPublicly((value) => !value)}
            label={t("showBirthdayPublicly")}
          />
          <span className="text-sm text-muted-foreground">{t("showBirthdayPublicly")}</span>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
