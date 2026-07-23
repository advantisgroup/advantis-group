"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

export function ManagerIntroStep() {
  const t = useTranslations("Onboarding");
  const user = useCurrentUser();
  const orgContext = useQuery(api.users.orgContext, {
    userId: user._id as Id<"users">,
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("managerTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("managerHint")}</p>
      </div>

      {orgContext?.manager ? (
        <div className="flex items-center gap-4 rounded-xl border border-border/70 p-4">
          <Avatar className="size-14">
            {orgContext.manager.avatar && (
              <AvatarImage
                src={orgContext.manager.avatar}
                alt={orgContext.manager.name}
              />
            )}
            <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
              {initials(orgContext.manager.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold tracking-tight">
              {orgContext.manager.name}
            </p>
            {orgContext.manager.jobTitle && (
              <p className="text-sm text-muted-foreground">
                {orgContext.manager.jobTitle}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          <UserRound className="size-5 shrink-0" />
          {t("managerNone")}
        </div>
      )}
    </div>
  );
}
