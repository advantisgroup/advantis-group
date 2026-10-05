"use client";

import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type Sort, SortableHead } from "@/components/ui/sortable-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { initials } from "@/lib/format";
import { teamColor, teamLabelKey } from "@/lib/teams";
import { cn } from "@/lib/utils";

import { ContactActions } from "./ContactActions";
import { type Person, type PersonStatus } from "./person-status";
import { StatusPill } from "./StatusPill";

export type SortKey = "name" | "department" | "role";

/**
 * The default view: one row per person, which is what a directory of this size
 * actually wants. Thirteen people in a three-column card grid gave every person
 * a 300px box that then had to squeeze name, title, role, department, teams and
 * availability into it — a table gives each of those a column and reads in one
 * pass.
 *
 * Columns drop by priority as the viewport narrows (teams, then department, then
 * role) so the identity and the contact actions survive to the smallest width;
 * `Table` already wraps itself in an `overflow-x-auto`, so nothing clips.
 */
export function PersonTable({
  people,
  statuses,
  sort,
  onSort,
  onOpenProfile,
  onMessage,
  currentUserId,
}: {
  people: Person[];
  statuses: Map<string, PersonStatus>;
  sort: Sort<SortKey>;
  onSort: (key: SortKey) => void;
  onOpenProfile: (id: Person["_id"]) => void;
  onMessage: (id: Person["_id"]) => void;
  currentUserId: string;
}) {
  const t = useTranslations("Directory");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortableHead
            label={t("columnPerson")}
            active={sort.key === "name"}
            dir={sort.dir}
            onClick={() => onSort("name")}
          />
          <SortableHead
            label={t("columnRole")}
            active={sort.key === "role"}
            dir={sort.dir}
            onClick={() => onSort("role")}
            className="hidden sm:table-cell"
          />
          <SortableHead
            label={t("columnDepartment")}
            active={sort.key === "department"}
            dir={sort.dir}
            onClick={() => onSort("department")}
            className="hidden md:table-cell"
          />
          <TableHead className="hidden lg:table-cell">{t("columnTeams")}</TableHead>
          <TableHead>{t("columnStatus")}</TableHead>
          <TableHead className="text-right">{t("columnContact")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => {
          const status = statuses.get(person._id) ?? { kind: "away" as const };
          return (
            <TableRow key={person._id} data-person={person._id} className="scroll-mt-24">
              <TableCell className="py-2">
                <button
                  type="button"
                  onClick={() => onOpenProfile(person._id)}
                  aria-label={t("openProfile", { name: person.name })}
                  className="flex min-w-0 items-center gap-2.5 text-left"
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-8">
                      {person.avatar && <AvatarImage src={person.avatar} alt="" />}
                      <AvatarFallback className="text-xs">
                        {initials(person.name, person.email)}
                      </AvatarFallback>
                    </Avatar>
                    {status.kind === "online" ? (
                      <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-success" />
                    ) : null}
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate font-medium leading-tight">{person.name}</span>
                    {person.jobTitle && (
                      <span className="block truncate text-xs leading-tight text-muted-foreground">
                        {person.jobTitle}
                      </span>
                    )}
                  </span>
                </button>
              </TableCell>
              <TableCell className="hidden py-2 sm:table-cell">
                <Badge variant="muted" className="text-[10px]">
                  {person.roleLabel || tRoles(person.role)}
                </Badge>
              </TableCell>
              <TableCell className="hidden py-2 text-sm text-muted-foreground md:table-cell">
                {person.department ?? "—"}
              </TableCell>
              <TableCell className="hidden py-2 lg:table-cell">
                {person.teams.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {person.teams.map((id) => (
                      <Badge key={id} variant="outline" className="gap-1 text-[10px]">
                        <span className={cn("size-1.5 rounded-full", teamColor(id))} />
                        {tTeams(teamLabelKey(id))}
                      </Badge>
                    ))}
                  </span>
                )}
              </TableCell>
              <TableCell className="py-2">
                <StatusPill status={status} />
              </TableCell>
              <TableCell className="py-2">
                <ContactActions
                  email={person.email}
                  phone={person.phone}
                  onMessage={person._id === currentUserId ? undefined : () => onMessage(person._id)}
                  className="justify-end"
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
