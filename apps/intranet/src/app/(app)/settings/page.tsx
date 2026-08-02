"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useClerk } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Camera,
  Check,
  Circle,
  ExternalLink,
  Link2,
  Loader2,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  SkipForward,
  Unlink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderBadge } from "@/components/branding/ProviderMark";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import {
  NotificationPreferences,
  Switch,
} from "@/components/notifications/NotificationPreferences";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import type { CheckpointStatus } from "@/components/tour/tour-types";
import { useTour } from "@/components/tour/TourProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpdatesEmailConsent } from "@/components/updates/UpdatesEmailConsent";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials, roleLabel } from "@/lib/format";
import { cropToSquare } from "@/lib/image";
import { START_PAGES } from "@/lib/startPages";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

function CheckpointStatusIcon({ status }: { status: CheckpointStatus }) {
  if (status === "completed") return <Check className="size-3.5 text-green-500" />;
  if (status === "skipped") return <SkipForward className="size-3.5 text-muted-foreground" />;
  if (status === "active") return <Circle className="size-3.5 fill-blue-500 text-blue-500" />;
  return <Circle className="size-3.5 text-muted-foreground/40" />;
}

function AppPreferencesCard() {
  const t = useTranslations("Settings");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);

  const pageLabel: Record<(typeof START_PAGES)[number], string> = {
    "/": t("pageDashboard"),
    "/calendar": t("pageCalendar"),
    "/clockodo": t("pageAbsences"),
    "/announcements": t("pageAnnouncements"),
    "/chat": t("pageChat"),
    "/files": t("pageFiles"),
  };

  return (
    <Card data-tour="tour-settings-app-prefs">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-semibold tracking-tight">{t("appPrefs")}</p>
          <p className="text-sm text-muted-foreground">{t("appPrefsHint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("defaultCalendarView")}</Label>
            <Select
              value={prefs?.defaultCalendarView ?? "month"}
              onValueChange={(v) =>
                void setPrefs({
                  defaultCalendarView: v as "month" | "week" | "list",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">{t("viewMonth")}</SelectItem>
                <SelectItem value="week">{t("viewWeek")}</SelectItem>
                <SelectItem value="list">{t("viewList")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("startPage")}</Label>
            <Select
              value={prefs?.startPage ?? "/"}
              onValueChange={(v) => void setPrefs({ startPage: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {START_PAGES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {pageLabel[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("weekStart")}</Label>
            <Select
              value={prefs?.weekStartsOn ?? "monday"}
              onValueChange={(v) => void setPrefs({ weekStartsOn: v as "monday" | "sunday" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monday">{t("monday")}</SelectItem>
                <SelectItem value="sunday">{t("sunday")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionsCard() {
  const t = useTranslations("Settings");
  const connections = useQuery(api.users.myConnections);
  const migrateLegacyLink = useMutation(api.integrations.clockodoLink.migrateLegacyClockodoLink);
  const [migrating, setMigrating] = useState(false);
  if (!connections) return null;

  const clockodoLinked =
    connections.clockodoDirect || (connections.personLinked && connections.personHasClockodo);

  return (
    <Card data-tour="tour-settings-connections">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-semibold tracking-tight">{t("connections")}</p>
          <p className="text-sm text-muted-foreground">{t("connectionsHint")}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderBadge provider="clockodo" />
              <span className="hidden text-xs text-muted-foreground sm:block">
                {clockodoLinked
                  ? connections.clockodoDirect
                    ? t("clockodoDirect")
                    : t("clockodoViaPerson")
                  : t("clockodoUnlinkedHint")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!connections.clockodoDirect && connections.personHasClockodo && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={migrating}
                  onClick={() => {
                    setMigrating(true);
                    void migrateLegacyLink({})
                      .then(() => toast.success(t("clockodoMigrationSuccess")))
                      .catch(() => toast.error(t("clockodoMigrationError")))
                      .finally(() => setMigrating(false));
                  }}
                >
                  {migrating && <Loader2 className="size-3.5 animate-spin" />}
                  {t("clockodoMigrate")}
                </Button>
              )}
              <Badge variant={clockodoLinked ? "success" : "muted"} className="gap-1">
                {clockodoLinked ? <Link2 className="size-3" /> : <Unlink className="size-3" />}
                {clockodoLinked ? t("linked") : t("notLinked")}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="text-sm font-medium">{t("activityTrack")}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                {connections.personLinked
                  ? (connections.personName ?? "")
                  : t("personUnlinkedHint")}
              </span>
            </div>
            <Badge
              variant={connections.personLinked ? "success" : "muted"}
              className="shrink-0 gap-1"
            >
              {connections.personLinked ? (
                <Link2 className="size-3" />
              ) : (
                <Unlink className="size-3" />
              )}
              {connections.personLinked ? t("linked") : t("notLinked")}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingRestartCard() {
  const t = useTranslations("Onboarding");
  const { restart } = useOnboarding();

  return (
    <Card data-tour="tour-settings-onboarding">
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold tracking-tight">{t("settingsCardTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("restartOnboardingHint")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={restart}>
          <RotateCw className="size-3.5" />
          {t("restartOnboarding")}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tn = useTranslations("Notifications");
  const tRoles = useTranslations("Roles");
  const tt = useTranslations("Tour");
  const user = useCurrentUser();
  const clerk = useClerk();
  const { state: tourState, visibleCheckpoints, redoCheckpoint, redoTour } = useTour();
  const updateProfile = useAction(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();

  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth ?? "");
  const [showBirthdayPublicly, setShowBirthdayPublicly] = useState(
    user.showBirthdayPublicly ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<{
    blob: Blob;
    url: string;
  } | null>(null);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview.url);
    },
    [avatarPreview],
  );

  const completeness = [
    Boolean(user.avatar),
    firstName.trim().length > 0,
    lastName.trim().length > 0,
    jobTitle.trim().length > 0,
    department.trim().length > 0,
    phone.trim().length > 0,
  ];
  const completePct = Math.round((completeness.filter(Boolean).length / completeness.length) * 100);

  async function save() {
    setBusy(true);
    try {
      await updateProfile({
        firstName,
        lastName,
        jobTitle,
        department,
        phone,
        dateOfBirth,
        showBirthdayPublicly,
      });
      toast.success(t("saved"));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await cropToSquare(file);
      setAvatarPreview({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      handleError(err);
    }
  }

  async function confirmAvatar() {
    if (!avatarPreview) return;
    try {
      const cropped = new File([avatarPreview.blob], "avatar.jpg", {
        type: "image/jpeg",
      });
      const avatarStorageId = await uploadToConvex(() => generateUploadUrl({}), cropped);
      await updateProfile({ avatarStorageId });
      toast.success(t("saved"));
    } catch (e) {
      handleError(e);
    } finally {
      setAvatarPreview(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("title")} tourCheckpoint="settings" />
      {/* Personal identity hero */}
      <Card className="overflow-hidden" data-tour="tour-settings-profile">
        <div className="app-atmosphere flex items-center gap-4 border-b border-border/60 px-5 py-5">
          <label className="group relative cursor-pointer">
            <Avatar className="size-16 ring-2 ring-background">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors group-hover:bg-accent">
              <Camera className="size-3.5" />
            </span>
            <span className="sr-only">{t("uploadAvatar")}</span>
            <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t("account")}
            </p>
            <h2 className="truncate font-display text-xl font-bold tracking-tight">{user.name}</h2>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <Badge variant="muted" className="mt-1.5">
              {roleLabel(user, tRoles)}
            </Badge>
          </div>
        </div>

        <CardContent className="space-y-4 pt-5">
          {completePct < 100 && (
            <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{t("completeness", { pct: completePct })}</span>
                <span className="tabular-nums text-muted-foreground">{completePct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${completePct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("completenessHint")}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{t("personalInfo")}</p>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("accountHint")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("department")}</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("dateOfBirth")}</Label>
            <div className="flex items-center gap-3">
              <Input
                type="date"
                className="max-w-48"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={showBirthdayPublicly}
                  onToggle={() => setShowBirthdayPublicly((v) => !v)}
                  label={t("showBirthdayPublicly")}
                />
                <span className="text-sm text-muted-foreground">{t("showBirthdayPublicly")}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("dateOfBirthHint")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => clerk.openUserProfile()}>
              <ShieldCheck className="size-3.5" />
              {t("manageAccount")}
              <ExternalLink className="size-3" />
            </Button>
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
            <SettingsMenu />
          </div>
        </CardContent>
      </Card>

      <AppPreferencesCard />

      <ConnectionsCard />

      {/* Notification preferences (same controls as the notifications tab) */}
      <div id="notifications" className="scroll-mt-24" />
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-semibold tracking-tight">{tn("preferences")}</p>
            <p className="text-sm text-muted-foreground">{tn("preferencesHint")}</p>
          </div>
          <NotificationPreferences />
        </CardContent>
      </Card>

      {/* Updates email consent — externals only; internal employees are
          always eligible and get no toggle (see UpdatesEmailConsent). */}
      {user.external && (
        <Card>
          <CardContent className="p-5">
            <UpdatesEmailConsent />
          </CardContent>
        </Card>
      )}

      <OnboardingRestartCard />

      {/* Onboarding Tour */}
      {tourState && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{tt("chipTitle")}</p>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <p className="text-xs text-muted-foreground">{tt("settingsHint")}</p>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={redoTour}>
              <RotateCw className="size-3.5" />
              {tt("restartTour")}
            </Button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleCheckpoints.map((cp) => {
                const cpState = tourState.checkpoints[cp.id];
                const status: CheckpointStatus = cpState?.status ?? "pending";
                return (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckpointStatusIcon status={status} />
                      <span className="truncate text-sm">{tt(`checkpoints.${cp.id}`)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      onClick={() => redoCheckpoint(cp.id)}
                    >
                      <RotateCcw className="size-3" />
                      {tt("redo")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Avatar crop preview */}
      <Dialog open={avatarPreview !== null} onOpenChange={(o) => !o && setAvatarPreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("avatarPreviewTitle")}</DialogTitle>
            <DialogDescription>{t("avatarPreviewHint")}</DialogDescription>
          </DialogHeader>
          {avatarPreview && (
            <div className="flex justify-center py-2">
              <img
                src={avatarPreview.url}
                alt={t("avatar")}
                className={cn("size-40 rounded-full border border-border object-cover")}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAvatarPreview(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void confirmAvatar()}>{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
