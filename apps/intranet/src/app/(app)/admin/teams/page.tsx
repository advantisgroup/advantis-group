"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Users2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { OrgEntityCrudList } from "@/components/admin/OrgEntityCrudList";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";

export default function TeamsPage() {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();

  const teams = useQuery(api.orgData.listTeams, {});
  const createTeam = useMutation(api.orgData.createTeam);
  const renameTeam = useMutation(api.orgData.renameTeam);
  const archiveTeam = useMutation(api.orgData.archiveTeam);
  const setReportsTo = useMutation(api.orgData.setTeamReportsTo);
  const people = useQuery(api.users.list, isAdmin ? {} : "skip");

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
