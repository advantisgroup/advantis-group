"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Building2,
  Clock,
  KeyRound,
  Mail,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AdminOverview } from "@/app/(app)/admin/AdminOverview";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { Link } from "@/components/Link";
import { OneDriveAuditPanel } from "@/components/onedrive/OneDriveAuditPanel";
import { UploadApprovalQueue } from "@/components/onedrive/UploadApprovalQueue";
import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useHasCapability,
  useIsManager,
} from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

function QuickLinkCard({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  count?: number;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{label}</p>
          </div>
          {count !== undefined && count > 0 && (
            <span className="shrink-0 rounded-full bg-signal/15 px-2 py-0.5 text-xs font-semibold text-signal">
              {count}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const hasUploadsView = useHasCapability("manage_uploads");
  const me = useCurrentUser();
  const isAdmin = me.role === "admin";

  const requests = useQuery(
    api.accessRequests.list,
    isManager ? { status: "pending" } : "skip"
  );
  const invites = useQuery(
    api.invites.list,
    isManager ? { status: "pending" } : "skip"
  );
  const guests = useQuery(api.guest.listTempLogins, isAdmin ? {} : "skip");
  const pendingUploads = useQuery(
    api.onedrive.listPending,
    isManager || hasUploadsView ? {} : "skip"
  );

  if (!isManager) {
    // An employee with the `manage_uploads` custom-role capability gets a
    // read-only slice of this page (queue + audit log) instead of the full
    // member-management admin panel. Approving/denying still requires a real
    // manager — that write goes through OneDrive's locked-in access rules.
    if (hasUploadsView) {
      return (
        <div className="mx-auto max-w-6xl space-y-8">
          <PageHeader
            title={t("uploads")}
            description={t("pendingUploads")}
            icon={<ShieldCheck />}
          />
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("pendingUploads")}
            </h3>
            <UploadApprovalQueue readOnly />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("oneDriveActivity")}
            </h3>
            <OneDriveAuditPanel />
          </div>
        </div>
      );
    }
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={<ShieldCheck />}
      />
      <AdminOverview isAdmin={isAdmin} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLinkCard
          href="/admin/requests"
          icon={Clock}
          label={t("accessRequests")}
          count={requests?.length}
        />
        <QuickLinkCard
          href="/admin/invites"
          icon={Mail}
          label={t("invites")}
          count={invites?.length}
        />
        <QuickLinkCard
          href="/admin/members"
          icon={Users}
          label={t("members")}
        />
        <QuickLinkCard
          href="/admin/uploads"
          icon={Upload}
          label={t("uploads")}
          count={pendingUploads?.length}
        />
        <QuickLinkCard
          href="/admin/roles"
          icon={ShieldCheck}
          label={t("customRolesTab")}
        />
        {isAdmin && (
          <QuickLinkCard
            href="/admin/guests"
            icon={KeyRound}
            label={t("guests")}
            count={guests?.filter(g => g.status === "active").length}
          />
        )}
        {isAdmin && (
          <QuickLinkCard
            href="/admin/data-cleanup"
            icon={Building2}
            label={t("dataCleanup.title")}
          />
        )}
      </div>
    </div>
  );
}
