"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

import { StepGroup, StepIntro } from "./step-parts";

export function ManagerIntroStep() {
  const t = useTranslations("Onboarding");
  const tProfile = useTranslations("Profile");
  const user = useCurrentUser();
  const orgContext = useQuery(api.people.users.orgContext, {
    userId: user._id as Id<"users">,
  });
  const lines = orgContext?.lines;

  return (
    <>
      <StepIntro title={t("managerTitle")} hint={t("managerHint")} />
      <StepGroup>
        {lines === undefined ? (
          <div className="h-[74px] animate-pulse rounded-xl bg-muted/60" />
        ) : lines.length > 0 ? (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
            {lines.map((line) => (
              <li key={line.person._id} className="flex items-center gap-3.5 px-4 py-3.5">
                <Avatar className="size-11">
                  {line.person.avatar && (
                    <AvatarImage src={line.person.avatar} alt={line.person.name} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                    {initials(line.person.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{line.person.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {line.via === "manual"
                      ? (line.person.jobTitle ?? tProfile("lineManual"))
                      : tProfile(line.via === "team" ? "lineTeam" : "lineDepartment", {
                          name: line.label ?? "",
                        })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-4 text-[14px] text-muted-foreground">
            <UserRound className="size-5 shrink-0" />
            {t("managerNone")}
          </div>
        )}
      </StepGroup>
    </>
  );
}
