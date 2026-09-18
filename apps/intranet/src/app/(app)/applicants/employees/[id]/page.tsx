"use client";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, Building2, Link2, Mail, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { OnboardingChecklist } from "@/components/applicants/OnboardingChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

const NONE = "__none__";

export default function EmployeeOverviewPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employeeProfileId = params.id as Id<"employeeProfiles">;
  const profile = useQuery(api.hr.employees.getProfile, { employeeProfileId });
  const users = useQuery(api.people.users.list, {}) ?? [];
  const update = useMutation(api.hr.employees.updateProfile);
  const archive = useMutation(api.hr.employees.archiveProfile);

  if (!profile) return null;
  const profileName = profile.name;

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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
                defaultValue={profile.department ?? ""}
                onBlur={(event) =>
                  event.target.value !== (profile.department ?? "") &&
                  void save({ employeeProfileId, department: event.target.value })
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
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <UserRound className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {profile.linkedProfile?.name ?? t("employeeNoAccount")}
                </p>
                <p className="text-xs text-muted-foreground">{t("employeeAccountHint")}</p>
              </div>
            </div>
            <Select
              value={profile.userId ?? NONE}
              onValueChange={(value) =>
                void save({
                  employeeProfileId,
                  userId: value === NONE ? null : (value as Id<"users">),
                })
              }
            >
              <SelectTrigger aria-label={t("employeeAccount")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("employeeNoAccount")}</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant={profile.userId ? "success" : "outline"}>
              <Link2 className="size-3" />
              {profile.userId ? t("employeeLinked") : t("employeeNotLinked")}
            </Badge>
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

        <Button
          variant="outline"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void archiveProfile()}
        >
          <Archive className="size-4" />
          {t("employeeArchive")}
        </Button>
      </div>
    </div>
  );
}
