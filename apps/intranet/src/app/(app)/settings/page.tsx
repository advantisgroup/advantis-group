"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Check,
  Circle,
  CircleHelp,
  Link2,
  Loader2,
  Pencil,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Unlink,
  UserRound,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderBadge } from "@/components/branding/ProviderMark";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { AccountProfileDialog } from "@/components/profile/AccountProfileDialog";
import { ProfileEditorDialog } from "@/components/profile/ProfileEditorDialog";
import { useCurrentUser } from "@/components/providers/current-user";
import type { CheckpointStatus } from "@/components/tour/tour-types";
import { useTour } from "@/components/tour/TourProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpdatesEmailConsent } from "@/components/updates/UpdatesEmailConsent";
import { useIsMobile } from "@/hooks/use-mobile";
import { initials, roleLabel } from "@/lib/format";
import { profileColorStyle, profileGradientClass } from "@/lib/profile-gradient";
import { START_PAGES } from "@/lib/startPages";
import { cn } from "@/lib/utils";

function CheckpointStatusIcon({ status }: { status: CheckpointStatus }) {
  if (status === "completed") return <Check className="size-3.5 text-green-500" />;
  if (status === "skipped") return <SkipForward className="size-3.5 text-muted-foreground" />;
  if (status === "active") return <Circle className="size-3.5 fill-blue-500 text-blue-500" />;
  return <Circle className="size-3.5 text-muted-foreground/40" />;
}

type SettingsSectionId = "account" | "workspace" | "notifications" | "help";

function SettingsNavigation({
  activeSection,
  onSectionChange,
}: {
  activeSection: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}) {
  const t = useTranslations("Settings");
  const isMobile = useIsMobile();
  const { setTabs } = useBottomNavTabs();
  const sections = useMemo<
    {
      id: SettingsSectionId;
      icon: LucideIcon;
      title: string;
      hint: string;
    }[]
  >(
    () => [
      { id: "account", icon: UserRound, title: t("account"), hint: t("accountHint") },
      {
        id: "workspace",
        icon: SlidersHorizontal,
        title: t("workspace"),
        hint: t("workspaceHint"),
      },
      {
        id: "notifications",
        icon: Bell,
        title: t("notifications"),
        hint: t("notificationsHint"),
      },
      { id: "help", icon: CircleHelp, title: t("help"), hint: t("helpHint") },
    ],
    [t],
  );

  useEffect(() => {
    if (!isMobile) return;

    setTabs(
      sections.map(({ id, icon, title }) => ({
        value: id,
        label: title,
        icon,
        onClick: () => onSectionChange(id),
      })),
      activeSection,
    );

    return () => setTabs(null, null);
  }, [activeSection, isMobile, onSectionChange, sections, setTabs]);

  return (
    <>
      <nav className="hidden md:sticky md:top-6 md:row-span-4 md:block" aria-label={t("title")}>
        <Card>
          <CardContent className="space-y-1 p-2">
            <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("title")}
            </p>
            {sections.map(({ id, icon: Icon, title, hint }) => {
              const active = id === activeSection;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSectionChange(id)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{hint}</span>
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </nav>
    </>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  hint,
  active,
  children,
}: {
  id: SettingsSectionId;
  icon: LucideIcon;
  title: string;
  hint: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("space-y-3 md:col-start-2", !active && "hidden")}>
      <div className="flex items-start gap-3 px-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
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
  const tn = useTranslations("Notifications");
  const tRoles = useTranslations("Roles");
  const tt = useTranslations("Tour");
  const user = useCurrentUser();
  const { state: tourState, visibleCheckpoints, redoCheckpoint, redoTour } = useTour();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("account");
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  function openAccount() {
    setAccountOpen(true);
  }

  function onAccountOpenChange(open: boolean) {
    setAccountOpen(open);
    if (!open && window.location.hash.startsWith("#passkey")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  useEffect(() => {
    if (window.location.hash === "#passkey") {
      window.history.replaceState(null, "", "#passkeys");
      setAccountOpen(true);
    }
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl items-start gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="md:col-span-2">
        <PageHeaderBar title={t("title")} tourCheckpoint="settings" />
      </div>
      <SettingsNavigation activeSection={activeSection} onSectionChange={setActiveSection} />

      <SettingsSection
        id="account"
        icon={UserRound}
        title={t("account")}
        hint={t("accountHint")}
        active={activeSection === "account"}
      >
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
              <Button variant="outline" size="sm" onClick={openAccount}>
                <ShieldCheck className="size-3.5" />
                {t("manageAccount")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        id="workspace"
        icon={SlidersHorizontal}
        title={t("workspace")}
        hint={t("workspaceHint")}
        active={activeSection === "workspace"}
      >
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
      </SettingsSection>

      <SettingsSection
        id="notifications"
        icon={Bell}
        title={t("notifications")}
        hint={t("notificationsHint")}
        active={activeSection === "notifications"}
      >
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="font-semibold tracking-tight">{tn("preferences")}</p>
              <p className="text-sm text-muted-foreground">{tn("preferencesHint")}</p>
            </div>
            <NotificationPreferences />
          </CardContent>
        </Card>
        {user.external && (
          <Card>
            <CardContent className="p-5">
              <UpdatesEmailConsent />
            </CardContent>
          </Card>
        )}
      </SettingsSection>

      <SettingsSection
        id="help"
        icon={Waypoints}
        title={t("help")}
        hint={t("helpHint")}
        active={activeSection === "help"}
      >
        <OnboardingRestartCard />
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
      </SettingsSection>

      <ProfileEditorDialog
        user={user}
        open={profileEditorOpen}
        onOpenChange={setProfileEditorOpen}
      />
      <AccountProfileDialog open={accountOpen} onOpenChange={onAccountOpenChange} />
    </div>
  );
}
