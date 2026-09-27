"use client";

import { useTranslations } from "next-intl";

import { PersonIdentityBadges } from "@/components/people/PersonIdentityBadges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { StatusMessage } from "@/components/profile/StatusMessage";
import { initials } from "@/lib/format";
import { profileColorStyle, profileGradientClass } from "@/lib/profile-gradient";
import { cn } from "@/lib/utils";

import { ContactActions, CopyableText } from "./ContactActions";
import { hasRealName, type Person, type PersonStatus } from "./person-status";
import { StatusPill } from "./StatusPill";

/**
 * Grid-view card, rebuilt around a real identity hierarchy.
 *
 * The version this replaces never rendered `person.name` at all — its only text
 * line was `jobTitle || email` in muted 12px, so the directory showed job
 * titles for the few people who had one and raw email addresses for everyone
 * else, with the actual name nowhere on the page. Name is now the primary line
 * at full weight; job title is secondary; badges get their own row instead of
 * competing with the identity; and availability is one pill rather than a
 * coloured line wedged under a wrapping badge stack.
 */
export function PersonCard({
  person,
  status,
  onOpenProfile,
  onMessage,
}: {
  person: Person;
  status: PersonStatus;
  onOpenProfile: () => void;
  onMessage?: () => void;
}) {
  const t = useTranslations("Directory");
  const showEmailLine = hasRealName(person);

  return (
    <Card
      data-person={person._id}
      className="group scroll-mt-24 overflow-hidden transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-18px_rgb(0_0_0/0.18)]"
    >
      <div
        className={cn("h-1.5", profileGradientClass(person.profileGradient))}
        style={profileColorStyle(person.profileColor)}
      />
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label={t("openProfile", { name: person.name })}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="relative shrink-0">
          <Avatar className="size-11">
            {person.avatar && <AvatarImage src={person.avatar} alt="" />}
            <AvatarFallback>{initials(person.name, person.email)}</AvatarFallback>
          </Avatar>
          {status.kind === "online" || status.kind === "inOffice" ? (
            <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-success" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight tracking-tight">{person.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {person.jobTitle || t("noJobTitle")}
          </p>
          <StatusMessage status={person.statusMessage} compact className="mt-1" />
        </div>
      </button>

      <div className="space-y-2.5 px-4 pb-3">
        {/* maxTags=3 rather than the default 1: the card now has a row of its
            own for these, so collapsing straight to "+N" hid information for
            no gain. */}
        <PersonIdentityBadges
          role={person.role}
          department={person.department}
          teams={person.teams}
          maxTags={3}
          className="flex flex-wrap items-center gap-1"
        />
        <StatusPill status={status} />
      </div>

      {/* `mt-auto`: grid items stretch to the tallest card in the row, so
          without it a person with one badge row gets a footer floating in
          mid-card while their neighbour's sits at the bottom. */}
      <div className="mt-auto flex items-center gap-2 border-t border-border/60 px-3 py-2">
        {showEmailLine ? (
          <CopyableText value={person.email} className="flex-1" />
        ) : (
          <span className="flex-1" />
        )}
        <ContactActions
          email={person.email}
          phone={person.phone}
          onMessage={onMessage}
          className="shrink-0"
        />
      </div>
    </Card>
  );
}
