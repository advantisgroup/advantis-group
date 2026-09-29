"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Camera, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { rise, StepGroup, StepIntro } from "./step-parts";

type TextField = "firstName" | "lastName" | "jobTitle" | "phone";

const TEXT_FIELDS: { field: TextField; autoComplete: string; type?: string }[] = [
  { field: "firstName", autoComplete: "given-name" },
  { field: "lastName", autoComplete: "family-name" },
  { field: "jobTitle", autoComplete: "organization-title" },
  { field: "phone", autoComplete: "tel", type: "tel" },
];

export function ProfileStep() {
  const t = useTranslations("Onboarding");
  const ts = useTranslations("Settings");
  const user = useCurrentUser();
  const updateProfile = useMutation(api.people.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();

  const [fields, setFields] = useState<Record<TextField, string>>({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    jobTitle: user.jobTitle ?? "",
    phone: user.phone ?? "",
  });
  const saved = useRef(fields);
  const [gradient, setGradient] = useState(user.profileGradient);
  const [color, setColor] = useState(user.profileColor);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  // Saved straight away on blur rather than on a timer — a timer is cleared
  // when the step unmounts, which dropped whatever was typed just before Next.
  function saveField(field: TextField) {
    if (fields[field] === saved.current[field]) return;
    saved.current = { ...saved.current, [field]: fields[field] };
    updateProfile({ [field]: fields[field] }).catch(handleError);
  }

  function pickGradient(next: ProfileGradient) {
    setGradient(next);
    setColor(null);
    updateProfile({ profileGradient: next, profileColor: null }).catch(handleError);
  }

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      const cropped = await cropToSquare(file);
      setAvatarPreview(URL.createObjectURL(cropped));
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

  const avatarUrl = avatarPreview ?? user.avatar;
  const displayName =
    [fields.firstName, fields.lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ") || user.name;
  const subtitle = [fields.jobTitle.trim(), user.department].filter(Boolean).join(" · ");

  return (
    <>
      <StepIntro title={t("profileTitle")} hint={t("profileHint")} />

      <div className="space-y-7">
        {/* What colleagues will see, updating as you type. */}
        <motion.div
          variants={rise}
          className="overflow-hidden rounded-xl border border-border/70 bg-card"
        >
          <div
            className={cn(
              "h-16 transition-[background] duration-500",
              profileGradientClass(gradient),
            )}
            style={profileColorStyle(color)}
          />
          {/* Only the avatar reaches up into the banner; the name sits below
              it on the card, where it's always readable. */}
          <div className="flex items-end justify-between gap-3 px-4">
            <Avatar className="-mt-8 size-16 ring-4 ring-card">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name} />}
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials(displayName, user.email)}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <label
                className={cn("cursor-pointer", uploading && "pointer-events-none opacity-60")}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
                {ts("uploadAvatar")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void onAvatar(e)}
                />
              </label>
            </Button>
          </div>
          <div className="min-w-0 px-4 pb-4 pt-2.5">
            <p className="truncate font-display text-base font-semibold leading-tight tracking-tight">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {subtitle || user.email}
            </p>
          </div>
        </motion.div>

        <StepGroup label={ts("profileGradient")}>
          <div className="flex flex-wrap gap-2.5">
            {(Object.keys(PROFILE_GRADIENTS) as ProfileGradient[]).map((g) => {
              const selected = !color && (gradient ?? "aurora") === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={selected}
                  aria-label={ts(`gradient_${g}`)}
                  title={ts(`gradient_${g}`)}
                  onClick={() => pickGradient(g)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full bg-gradient-to-br ring-offset-2 ring-offset-card transition-[box-shadow,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    PROFILE_GRADIENTS[g],
                    selected && "ring-2 ring-foreground",
                  )}
                >
                  {selected && <Check className="size-4 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </StepGroup>

        <StepGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map(({ field, autoComplete, type }) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`onboarding-${field}`}>{ts(field)}</Label>
                <Input
                  id={`onboarding-${field}`}
                  type={type}
                  autoComplete={autoComplete}
                  value={fields[field]}
                  onChange={(e) => setFields({ ...fields, [field]: e.target.value })}
                  onBlur={() => saveField(field)}
                />
              </div>
            ))}
          </div>
        </StepGroup>
      </div>
    </>
  );
}
