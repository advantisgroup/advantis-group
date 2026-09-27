"use client";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, Building2, Mail, Phone, RefreshCw, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { OnboardingChecklist } from "@/components/applicants/OnboardingChecklist";
import { PersonChip, PersonPicker } from "@/components/people/PersonPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

export default function EmployeeOverviewPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employeeProfileId = params.id as Id<"employeeProfiles">;
  const profile = useQuery(api.hr.employees.getProfile, { employeeProfileId });
  const linkedAccounts = useQuery(api.hr.employees.linkedAccounts, {});
  const update = useMutation(api.hr.employees.updateProfile);
  const archive = useMutation(api.hr.employees.archiveProfile);

  if (!profile) return null;
  const profileName = profile.name;
  const account = profile.linkedProfile;
  const recordOf = new Set(linkedAccounts?.map((linked) => linked.userId));

  // What the intranet profile knows that this record says differently — only
  // fields the account actually has, so copying never blanks anything.
  const accountDetails: Partial<
    Record<"name" | "email" | "jobTitle" | "department" | "hireDate", string>
  > = {};
  if (account) {
    if (account.name !== profile.name) accountDetails.name = account.name;
    if (account.email !== profile.email) accountDetails.email = account.email;
    if (account.jobTitle && account.jobTitle !== profile.jobTitle) {
      accountDetails.jobTitle = account.jobTitle;
    }
    if (account.department && account.department !== profile.department) {
      accountDetails.department = account.department;
    }
    if (profile.accountHireDate && profile.accountHireDate !== profile.hireDate) {
      accountDetails.hireDate = profile.accountHireDate;
    }
  }
  const hasAccountDetails = Object.keys(accountDetails).length > 0;

  async function save(fields: Parameters<typeof update>[0]) {
    try {
      await update(fields);
      toast.success(t("employeeUpdated"));
    } catch (error) {
      handleError(error);
    }
  }

  async function archiveProfile() {
    const ok = await confirm({
      title: t("employeeArchiveConfirmTitle", { name: profileName }),
      description: t("employeeArchiveConfirmDescription"),
      confirmLabel: t("employeeArchive"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await archive({ employeeProfileId, archived: true });
      toast.success(t("employeeArchived"));
      router.push("/hr/employees");
    } catch (error) {
      handleError(error);
    }
  }

  async function restoreProfile() {
    try {
      await archive({ employeeProfileId, archived: false });
      toast.success(t("employeeRestored"));
    } catch (error) {
      handleError(error);
    }
  }

  const archived = profile.status === "archived";
  const notice = archived
    ? t("employeeArchivedNotice")
    : profile.accountStatus === "removed"
      ? t("employeeLeftNotice")
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {notice && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 xl:col-span-2",
            archived ? "border-border/70 bg-muted/40" : "border-warning/40 bg-warning/5",
          )}
        >
          {archived ? (
            <Archive className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <UserX className="size-4 shrink-0 text-warning" />
          )}
          <p className="min-w-0 flex-1 text-sm">{notice}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void (archived ? restoreProfile() : archiveProfile())}
          >
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {archived ? t("employeeRestore") : t("employeeArchive")}
          </Button>
        </div>
      )}
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("employeePersonalInformation")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employee-name">{t("name")}</Label>
              <Input
                id="employee-name"
                key={profile.name}
                defaultValue={profile.name}
                onBlur={(event) =>
                  event.target.value !== profile.name &&
                  void save({ employeeProfileId, name: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-email">{t("email")}</Label>
              <Input
                id="employee-email"
                key={profile.email}
                type="email"
                defaultValue={profile.email ?? ""}
                onBlur={(event) =>
                  event.target.value !== (profile.email ?? "") &&
                  void save({ employeeProfileId, email: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-phone">{t("phone")}</Label>
              <Input
                id="employee-phone"
                defaultValue={profile.phone ?? ""}
                onBlur={(event) =>
                  event.target.value !== (profile.phone ?? "") &&
                  void save({ employeeProfileId, phone: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("employeeEmployment")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-job-title">{t("jobTitle")}</Label>
              <Input
                id="employee-job-title"
                key={profile.jobTitle}
                defaultValue={profile.jobTitle ?? ""}
                onBlur={(event) =>
                  event.target.value !== (profile.jobTitle ?? "") &&
                  void save({ employeeProfileId, jobTitle: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-department">{t("department")}</Label>
              <Input
                id="employee-department"
                key={profile.department}
                defaultValue={profile.department ?? ""}
                onBlur={(event) =>
                  event.target.value !== (profile.department ?? "") &&
                  void save({ employeeProfileId, department: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-hire-date">{t("employeeHireDate")}</Label>
              <Input
                id="employee-hire-date"
                key={profile.hireDate}
                type="date"
                defaultValue={profile.hireDate ?? ""}
                onBlur={(event) =>
                  event.target.value !== (profile.hireDate ?? "") &&
                  void save({ employeeProfileId, hireDate: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("employeeInternalNotes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              defaultValue={profile.notes ?? ""}
              placeholder={t("internalNotesPlaceholder")}
              className="min-h-36"
              onBlur={(event) =>
                event.target.value !== (profile.notes ?? "") &&
                void save({ employeeProfileId, notes: event.target.value })
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <OnboardingChecklist employeeProfileId={employeeProfileId} items={profile.onboarding} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("employeeAccount")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {account ? (
              <PersonChip person={account} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("employeeAccountHint")}</p>
            )}
            <PersonPicker
              value={profile.userId ?? null}
              onChange={(userId) => void save({ employeeProfileId, userId })}
              label={t("employeeAccount")}
              noneLabel={t("employeeNoAccount")}
              hint={(person) =>
                recordOf.has(person.userId) && person.userId !== profile.userId
                  ? t("employeeHasRecord")
                  : null
              }
              isDisabled={(person) =>
                recordOf.has(person.userId) && person.userId !== profile.userId
              }
            />
            {hasAccountDetails && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  void update({ employeeProfileId, ...accountDetails })
                    .then(() => toast.success(t("employeeAccountDetailsCopied")))
                    .catch(handleError)
                }
              >
                <RefreshCw className="size-3.5" />
                {t("employeeUseAccountDetails")}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("contactData")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4" />
              <span className="truncate">{profile.email || t("employeeNoEmail")}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" />
              <span>{profile.phone || t("employeeNoPhone")}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="size-4" />
              <span>{profile.department || t("employeeNoDepartment")}</span>
            </div>
          </CardContent>
        </Card>

        {archived ? (
          <Button variant="outline" className="w-full" onClick={() => void restoreProfile()}>
            <ArchiveRestore className="size-4" />
            {t("employeeRestore")}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void archiveProfile()}
          >
            <Archive className="size-4" />
            {t("employeeArchive")}
          </Button>
        )}
      </div>
    </div>
  );
}
