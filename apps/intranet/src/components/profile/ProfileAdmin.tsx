"use client";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { VaultStepUpDialog } from "@/components/applicants/VaultStepUpDialog";
import { useCurrentUser } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Crown,
  Lock,
  LogOut,
  Send,
  ShieldCheck,
  UploadCloud,
  UserMinus,
  Users2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ActionGroup, ActionRow, Section, SettingRow } from "./ProfileParts";
import {
  LinkedAccountsSection,
  OffboardingChecklist,
  type ProfileUser,
  StarterChecklist,
  type StarterStep,
  TeamsEditor,
} from "./ProfileSections";

/**
 * Which "is this account actually set up" details are still missing. Lives
 * outside the checklist component because the management rail needs the
 * outstanding count to decide whether the setup tab is worth showing at all.
 */
function starterSteps(user: ProfileUser): StarterStep[] {
  return [
    { key: "photo", complete: Boolean(user.avatar) },
    { key: "contact", complete: Boolean(user.jobTitle && user.phone) },
    { key: "department", complete: Boolean(user.department) },
    { key: "team", complete: user.teams.length > 0 },
    { key: "clockodo", complete: user.clockodoUserId !== null },
    { key: "hireDate", complete: Boolean(user.hireDate) },
  ];
}

function AdminControls({
  user,
  isAdmin,
  onClose,
  onStartOffboarding,
}: {
  user: ProfileUser;
  isAdmin: boolean;
  onClose: () => void;
  onStartOffboarding?: () => void;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tProfile = useTranslations("Profile");
  const tRoles = useTranslations("Roles");
  const tCustomRoles = useTranslations("CustomRoles");
  const tApplicants = useTranslations("Applicants");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const setRole = useMutation(api.people.users.setRole);
  const setStatus = useMutation(api.people.users.setStatus);
  const removeMember = useMutation(api.people.members.remove);
  const reinvite = useAction(api.people.members.reinvite);
  const setUploadPermission = useMutation(api.people.users.setUploadPermission);
  const setGfAccess = useMutation(api.people.users.setGfAccess);
  const setApplicantDelegate = useMutation(api.people.users.setApplicantDelegate);
  const setManagingDirector = useMutation(api.people.users.setManagingDirector);
  const handleError = useErrorHandler();

  const isSelf = user._id === me._id;
  const isActive = user.status === "active";
  // Admins can be demoted via the role picker, but not suspended or removed
  // outright — that would let one admin lock another out of their own
  // account. Backend rejects these too; this just keeps the UI from
  // offering an action that's guaranteed to fail.
  const isTargetAdmin = user.role === "admin";

  function changeRole(role: Role) {
    setRole({ userId: user._id, role })
      .then(() => toast.success(tRoles(role)))
      .catch(handleError);
  }

  async function toggleStatus() {
    if (isActive) {
      const ok = await confirm({
        title: t("suspend"),
        description: tc("deleteWarning"),
        confirmLabel: t("suspend"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    setStatus({
      userId: user._id,
      status: isActive ? "suspended" : "active",
    }).catch(handleError);
  }

  async function onRemove() {
    const ok = await confirm({
      title: t("removeTitle", { name: user.name }),
      description: t("removeBody"),
      confirmLabel: t("removeMember"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    onClose();
    removeMember({ userId: user._id })
      .then(() => toast.success(t("removed")))
      .catch(handleError);
  }

  function onReinvite() {
    reinvite({ userId: user._id })
      .then(() => toast.success(t("reinviteSent")))
      .catch(handleError);
  }

  function toggleUploads() {
    setUploadPermission({
      userId: user._id,
      enabled: !user.uploadRequestsEnabled,
    })
      .then(() =>
        toast.success(user.uploadRequestsEnabled ? t("uploadsDisabled") : t("uploadsEnabled")),
      )
      .catch(handleError);
  }

  function toggleGf() {
    setGfAccess({ userId: user._id, gfAccess: !user.gfAccess })
      .then(() => toast.success(user.gfAccess ? t("gfRevoked") : t("gfGranted")))
      .catch(handleError);
  }

  function doToggleApplicantDelegate() {
    setApplicantDelegate({
      userId: user._id,
      delegate: !user.applicantAccessDelegate,
    })
      .then(() =>
        toast.success(
          user.applicantAccessDelegate
            ? t("applicantDelegateRevoked")
            : t("applicantDelegateGranted"),
        ),
      )
      .catch(handleError);
  }

  async function toggleApplicantDelegate() {
    const ok = await confirm({
      title: user.applicantAccessDelegate
        ? t("revokeApplicantDelegate")
        : t("grantApplicantDelegate"),
      description: tApplicants("delegateConfirmDescription", {
        name: user.name,
      }),
      confirmText: { target: user.name },
      confirmLabel: tc("confirm"),
      destructive: !!user.applicantAccessDelegate,
    });
    if (!ok) return;
    setStepUpOpen(true);
  }

  const hasCustomRoles = user.customRoles.length > 0;
  const hasNamedPermissions =
    user.gfAccess || user.applicantAccessDelegate || !user.uploadRequestsEnabled;

  // No section heading: this is the management rail's default tab, so the tab
  // label is already the heading.
  return (
    <div className="space-y-5">
      {(hasCustomRoles || hasNamedPermissions) && (
        <Section label={t("permissions")}>
          <div className="flex flex-wrap gap-1.5">
            {user.customRoles.map((role) => (
              <Tooltip key={role._id}>
                <TooltipTrigger asChild>
                  <Badge variant="muted" className="cursor-help gap-1">
                    <ShieldCheck className="size-3" />
                    {role.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {role.capabilities.length > 0
                    ? role.capabilities.map((cap) => tCustomRoles(`capability_${cap}`)).join(", ")
                    : tCustomRoles("noCapabilities")}
                </TooltipContent>
              </Tooltip>
            ))}
            {user.gfAccess && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="muted" className="cursor-help">
                    {t("gfBadge")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {t("gfAccessTooltip")}
                </TooltipContent>
              </Tooltip>
            )}
            {user.applicantAccessDelegate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="muted" className="cursor-help">
                    {t("applicantDelegateBadge")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {t("applicantDelegateBadgeTitle")}
                </TooltipContent>
              </Tooltip>
            )}
            {!user.uploadRequestsEnabled && <Badge variant="warning">{t("uploadsDisabled")}</Badge>}
          </div>
        </Section>
      )}

      {isAdmin && <LinkedAccountsSection userId={user._id} />}

      {/* Label above control, not beside it: the rail is a single narrow
          column, and a `justify-between` row left the role picker (three
          German role names) no width to live in. */}
      <div className="space-y-4">
        {isAdmin && !isSelf && (
          <SettingRow label={t("role")}>
            <RoleSelect value={user.role} onChange={changeRole} canElevate />
          </SettingRow>
        )}
        {isAdmin && (
          <SettingRow label={t("teams")}>
            <TeamsEditor userId={user._id} teams={user.teams} />
          </SettingRow>
        )}
        {!isSelf && (
          <SettingRow label={t("hireDate")}>
            <HireDateEditor userId={user._id} hireDate={user.hireDate} />
          </SettingRow>
        )}
      </div>

      {/* Permission grants and lifecycle actions only make sense on someone
          else's account. The risky two (suspend, remove) get their own group
          so they never sit flush against an everyday toggle. */}
      {!isSelf && (
        <div className="space-y-3">
          <ActionGroup>
            <ActionRow icon={<UploadCloud />} onClick={toggleUploads}>
              {user.uploadRequestsEnabled ? t("disableUploads") : t("enableUploads")}
            </ActionRow>
            {isAdmin && (
              <ActionRow icon={<Lock />} onClick={toggleGf}>
                {user.gfAccess ? t("revokeGf") : t("grantGf")}
              </ActionRow>
            )}
            {isAdmin && (
              <ActionRow icon={<Users2 />} onClick={() => void toggleApplicantDelegate()}>
                {user.applicantAccessDelegate
                  ? t("revokeApplicantDelegate")
                  : t("grantApplicantDelegate")}
              </ActionRow>
            )}
            {isAdmin && (
              <ActionRow
                icon={<Crown />}
                onClick={() =>
                  setManagingDirector({
                    userId: user._id,
                    managingDirector: !user.managingDirector,
                  })
                    .then(() => toast.success(tProfile("organisationSaved")))
                    .catch(handleError)
                }
              >
                {user.managingDirector
                  ? tProfile("managingDirectorRemove")
                  : tProfile("managingDirectorMake")}
              </ActionRow>
            )}
            {isAdmin && (
              <ActionRow icon={<Send />} onClick={onReinvite}>
                {t("reinvite")}
              </ActionRow>
            )}
            {onStartOffboarding && (
              <ActionRow icon={<LogOut />} onClick={onStartOffboarding}>
                {tProfile("startOffboarding")}
              </ActionRow>
            )}
          </ActionGroup>
          {isAdmin && !isTargetAdmin && (
            <ActionGroup>
              <ActionRow icon={<ShieldCheck />} onClick={() => void toggleStatus()}>
                {isActive ? t("suspend") : t("activate")}
              </ActionRow>
              <ActionRow icon={<UserMinus />} onClick={() => void onRemove()} destructive>
                {t("removeMember")}
              </ActionRow>
            </ActionGroup>
          )}
        </div>
      )}
      <VaultStepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onVerified={doToggleApplicantDelegate}
      />
    </div>
  );
}

/**
 * The manager-only right-hand rail. Administration is the landing tab — the
 * two checklists used to sit stacked above it and pushed the controls that
 * actually get used off-screen. The setup tab only appears while something is
 * still missing, and offboarding only once it has been started (or explicitly
 * opened from the admin tab), so neither is in the way on a normal profile.
 */
export function ManagementRail({
  user,
  isAdmin,
  onClose,
}: {
  user: ProfileUser;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Profile");
  const checklist = useQuery(api.org.offboarding.get, { userId: user._id });
  const [offboardingOpened, setOffboardingOpened] = useState(false);
  const [tab, setTab] = useState("manage");

  const steps = starterSteps(user);
  const outstanding = steps.filter((step) => !step.complete).length;
  const showSetup = outstanding > 0;
  const showOffboarding =
    offboardingOpened ||
    Boolean(checklist?.lastWorkingDay) ||
    (checklist?.completedSteps.length ?? 0) > 0;

  // A tab can disappear underneath the selection — completing the last setup
  // detail while the setup tab is open, say — so fall back to the one tab
  // that's always there rather than rendering an empty panel.
  const active =
    (tab === "setup" && !showSetup) || (tab === "offboarding" && !showOffboarding) ? "manage" : tab;

  return (
    <Tabs value={active} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      {/* Text-only triggers: three icon+label pairs don't fit the rail's width
          at German label lengths. The extra right padding on desktop keeps the
          last one clear of the dialog's close button, which sits over the
          rail once it's a column of its own. */}
      <div className="border-b border-border/70 px-3 py-2.5 lg:pr-12">
        <TabsList className="h-9 w-full justify-start">
          <TabsTrigger value="manage" className="px-3">
            {t("manageTab")}
          </TabsTrigger>
          {showSetup && (
            <TabsTrigger value="setup" className="gap-1.5 px-3">
              {t("setupTab")}
              <span className="rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold tabular-nums text-warning">
                {outstanding}
              </span>
            </TabsTrigger>
          )}
          {showOffboarding && (
            <TabsTrigger value="offboarding" className="px-3">
              {t("offboardingTab")}
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      <div className="p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <TabsContent value="manage" className="mt-0">
          <AdminControls
            user={user}
            isAdmin={isAdmin}
            onClose={onClose}
            onStartOffboarding={
              showOffboarding
                ? undefined
                : () => {
                    setOffboardingOpened(true);
                    setTab("offboarding");
                  }
            }
          />
        </TabsContent>
        {showSetup && (
          <TabsContent value="setup" className="mt-0">
            <StarterChecklist steps={steps} />
          </TabsContent>
        )}
        {showOffboarding && (
          <TabsContent value="offboarding" className="mt-0">
            <OffboardingChecklist user={user} checklist={checklist} />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}

/**
 * Managers+ only editor for `hireDate` — drives the overview's work
 * anniversary shoutouts. Not sensitive like `dateOfBirth`, so no visibility
 * toggle is needed; it's just Manager+-only to *set*.
 */
function HireDateEditor({ userId, hireDate }: { userId: Id<"users">; hireDate: string | null }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const setHireDate = useMutation(api.people.users.setHireDate);
  const handleError = useErrorHandler();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(hireDate ?? "");

  function save() {
    setHireDate({ userId, hireDate: value || undefined })
      .then(() => toast.success(tc("save")))
      .catch(handleError);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(hireDate ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 w-full justify-start">
          <CalendarClock className="size-3.5" />
          <span className={cn("truncate", !hireDate && "text-muted-foreground")}>
            {hireDate ? formatIsoDate(hireDate, locale) : t("hireDateUnset")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue("");
              setHireDate({ userId, hireDate: undefined })
                .then(() => toast.success(tc("save")))
                .catch(handleError);
              setOpen(false);
            }}
          >
            {tc("clear")}
          </Button>
          <Button size="sm" onClick={save}>
            {tc("save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
