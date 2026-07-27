"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { OrgEntityCrudList } from "@/components/admin/OrgEntityCrudList";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/components/providers/current-user";

export default function DepartmentsPage() {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();

  const departments = useQuery(api.orgData.listDepartments, {});
  const createDepartment = useMutation(api.orgData.createDepartment);
  const renameDepartment = useMutation(api.orgData.renameDepartment);
  const archiveDepartment = useMutation(api.orgData.archiveDepartment);

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={t("title")}
        title={t("orgEntity.departmentsTitle")}
        description={t("orgEntity.departmentsDescription")}
        icon={<Building2 />}
      />
      <OrgEntityCrudList
        entities={departments}
        createPlaceholder={t("orgEntity.departmentNamePlaceholder")}
        onCreate={(name) => createDepartment({ name }).then(() => {})}
        onRename={(departmentId, name) =>
          renameDepartment({
            departmentId: departmentId as Id<"departments">,
            name,
          }).then(() => {})
        }
        onArchiveToggle={(departmentId, archived) =>
          archiveDepartment({
            departmentId: departmentId as Id<"departments">,
            archived,
          }).then(() => {})
        }
      />
    </div>
  );
}
