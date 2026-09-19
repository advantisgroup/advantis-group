"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cropToSquare } from "@/lib/image";
import { uploadToConvex } from "@/lib/upload";

const SAVE_DEBOUNCE_MS = 600;

export function ProfileStep() {
  const t = useTranslations("Onboarding");
  const ts = useTranslations("Settings");
  const user = useCurrentUser();
  const updateProfile = useMutation(api.people.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();

  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar);
  const [uploading, setUploading] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateProfile({ firstName, lastName, jobTitle, phone }).catch(handleError);
    }, SAVE_DEBOUNCE_MS);
  }

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      const cropped = await cropToSquare(file);
      const previewUrl = URL.createObjectURL(cropped);
      setAvatarUrl(previewUrl);
      const avatarStorageId = await uploadToConvex(
        () => generateUploadUrl({}),
        new File([cropped], "avatar.jpg", { type: "image/jpeg" }),
      );
      await updateProfile({ avatarStorageId });
    } catch (err) {
      handleError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("profileTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("profileHint")}</p>
      </div>

      <div className="flex items-center gap-4">
        <label className="group relative cursor-pointer">
          <Avatar className="size-16 ring-2 ring-background">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name} />}
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors group-hover:bg-accent">
            <Camera className="size-3.5" />
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={onAvatar}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("profileAvatarHint")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{ts("firstName")}</Label>
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={scheduleSave}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{ts("lastName")}</Label>
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={scheduleSave}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{ts("jobTitle")}</Label>
        <Input
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          onBlur={scheduleSave}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{ts("phone")}</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={scheduleSave} />
      </div>
    </div>
  );
}
