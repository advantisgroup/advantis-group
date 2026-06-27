"use client";

import type { ChangeEvent } from "react";

import { useMutation } from "convex/react";
import { Camera } from "lucide-react";
import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initials } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const user = useCurrentUser();
  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateProfile({
        firstName,
        lastName,
        jobTitle,
        department,
        phone,
      });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const avatarStorageId = await uploadToConvex(
        () => generateUploadUrl({}),
        file
      );
      await updateProfile({ avatarStorageId });
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Personal identity hero */}
      <Card className="overflow-hidden">
        <div className="app-atmosphere flex items-center gap-4 border-b border-border/60 px-5 py-5">
          <div className="relative">
            <Avatar className="size-16 ring-2 ring-background">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 flex size-7 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent">
              <Camera className="size-3.5" />
              <span className="sr-only">{t("uploadAvatar")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatar}
              />
            </label>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t("account")}
            </p>
            <h2 className="truncate font-display text-xl font-bold tracking-tight">
              {user.name}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
            <Badge variant="muted" className="mt-1.5">
              {tRoles(user.role)}
            </Badge>
          </div>
        </div>

        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{t("personalInfo")}</p>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("accountHint")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("firstName")}</Label>
              <Input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("lastName")}</Label>
              <Input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("jobTitle")}</Label>
            <Input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("department")}</Label>
              <Input
                value={department}
                onChange={e => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("phone")}</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button onClick={save} disabled={busy}>
              {tc("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold tracking-tight">{t("preferences")}</p>
            <p className="text-sm text-muted-foreground">
              {t("language")} &amp; {t("theme")}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
