"use client";

import { useMutation } from "convex/react";
import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initials } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
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

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
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
      <PageHeader title={t("title")} />

      <Card nested>
        <CardHeader>
          <CardTitle className="text-base">{t("profile")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild>
                <span>{t("uploadAvatar")}</span>
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatar}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("firstName")}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("lastName")}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("jobTitle")}</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("department")}</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <Button onClick={save} disabled={busy}>
            {tc("save")}
          </Button>
        </CardContent>
      </Card>

      <Card nested>
        <CardHeader>
          <CardTitle className="text-base">{t("language")} & {t("theme")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
