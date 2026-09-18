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
  const tProfile = useTranslations("Profile");
  const user = useCurrentUser();
  const orgContext = useQuery(api.people.users.orgContext, {
    userId: user._id as Id<"users">,
  });
  const lines = orgContext?.lines ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("managerTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("managerHint")}</p>
      </div>

      {lines.length > 0 ? (
        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.person._id}
              className="flex items-center gap-4 rounded-xl border border-border/70 p-4"
            >
              <Avatar className="size-14">
                {line.person.avatar && (
                  <AvatarImage src={line.person.avatar} alt={line.person.name} />
                )}
                <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                  {initials(line.person.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold tracking-tight">{line.person.name}</p>
                <p className="text-sm text-muted-foreground">
                  {line.via === "manual"
                    ? (line.person.jobTitle ?? tProfile("lineManual"))
                    : tProfile(line.via === "team" ? "lineTeam" : "lineDepartment", {
                        name: line.label ?? "",
                      })}
                </p>
              </div>
            </div>
          ))}
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
