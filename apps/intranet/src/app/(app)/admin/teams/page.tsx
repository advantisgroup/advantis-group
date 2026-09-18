"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Users2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { OrgEntityCrudList, OrgModelIntro } from "@/components/admin/OrgEntityCrudList";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";

export default function TeamsPage() {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();

  const teams = useQuery(api.org.structure.listTeams, {});
  const createTeam = useMutation(api.org.structure.createTeam);
  const renameTeam = useMutation(api.org.structure.renameTeam);
  const archiveTeam = useMutation(api.org.structure.archiveTeam);
  const setReportsTo = useMutation(api.org.structure.setTeamReportsTo);
  const setTeamDepartment = useMutation(api.org.structure.setTeamDepartment);
  const departments = useQuery(api.org.structure.listDepartments, isAdmin ? {} : "skip");
  const people = useQuery(api.people.users.list, isAdmin ? {} : "skip");

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeaderBar
        title={t("orgEntity.teamsTitle")}
        description={t("orgEntity.teamsDescription")}
        icon={<Users2 />}
      />
      <OrgEntityCrudList
        entities={teams}
        showMemberCount
        intro={<OrgModelIntro />}
        parent={{
          options: departments ?? [],
          onChange: (teamId, departmentId) =>
            setTeamDepartment({
              teamId: teamId as Id<"teams">,
              departmentId: departmentId as Id<"departments"> | null,
            }).then(() => {}),
        }}
        reportsTo={{
          people: people ?? [],
          onChange: (teamId, userId) =>
            setReportsTo({
              teamId: teamId as Id<"teams">,
              userId: userId as Id<"users"> | null,
            }).then(() => {}),
        }}
        createInDialog
        createPlaceholder={t("orgEntity.teamNamePlaceholder")}
        onCreate={(name) => createTeam({ name }).then(() => {})}
        onRename={(teamId, name) =>
          renameTeam({ teamId: teamId as Id<"teams">, name }).then(() => {})
        }
        onArchiveToggle={(teamId, archived) =>
          archiveTeam({ teamId: teamId as Id<"teams">, archived }).then(() => {})
        }
      />
    </div>
  );
}
