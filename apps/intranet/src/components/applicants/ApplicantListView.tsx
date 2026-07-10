"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { matchSkills } from "@advantis/types";
import { useQuery } from "convex/react";
import { UserRoundSearch } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  AMPEL_ORDER,
  AmpelDot,
  AmpelLabel,
  type Ampel,
} from "@/components/applicants/AmpelBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { formatIsoDate } from "@/lib/format";

import type { FunctionReturnType } from "convex/server";

type Applicant = FunctionReturnType<typeof api.applicants.list>[number];
type SkillProfile = FunctionReturnType<typeof api.applicants.listProfiles>[number];

function ApplicantCard({
  applicant,
  profile,
}: {
  applicant: Applicant;
  profile: SkillProfile | null;
}) {
  const router = useRouter();
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const matched = profile ? matchSkills(profile.skills, applicant) : [];

  return (
    <button
      type="button"
      onClick={() => router.push(`/applicants/${applicant._id}`)}
      className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border/70 border-l-4 bg-card p-3.5 text-left transition-colors hover:bg-accent/40"
      style={{
        borderLeftColor:
          applicant.rating === "rot"
            ? "var(--destructive)"
            : applicant.rating === "blau"
              ? "var(--info)"
              : applicant.rating === "gruen"
                ? "var(--success)"
                : "var(--border)",
      }}
    >
      <AmpelDot rating={applicant.rating} className="size-3" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{applicant.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {applicant.position || t("positionUnknown")}
          {applicant.email ? ` · ${applicant.email}` : ""}
        </p>
      </div>
      {profile && (
        <span
          className={
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold " +
            (matched.length > 0
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground")
          }
        >
          {profile.name}: {matched.length}/{profile.skills.length}
        </span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("receivedOn", {
          date: formatIsoDate(new Date(applicant.createdAt).toISOString().slice(0, 10), locale),
        })}
      </span>
    </button>
  );
}

export function ApplicantListView({ mode }: { mode: "neu" | "pool" }) {
  const t = useTranslations("Applicants");
  const applicants = useQuery(api.applicants.list);
  const profiles = useQuery(api.applicants.listProfiles);
  const [search, setSearch] = useState("");
  const [poolFilter, setPoolFilter] = useState<Ampel | null>(null);

  const profileById = useMemo(
    () => new Map((profiles ?? []).map(p => [p._id, p])),
    [profiles]
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (applicants ?? [])
      .filter(a => a.status === mode)
      .filter(a => {
        if (!q) return true;
        return [a.name, a.email, a.position, a.telefon, a.adresse, ...(a.skills ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [applicants, mode, search]);

  if (mode === "pool") {
    const groups = AMPEL_ORDER.map(rating => ({
      rating,
      items: list.filter(a => a.rating === rating),
    }));
    const ohneBewertung = list.filter(a => !a.rating);
    const visibleGroups = poolFilter
      ? groups.filter(g => g.rating === poolFilter)
      : groups;

    return (
      <div className="space-y-6">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-md"
        />
        {list.length === 0 ? (
          <EmptyState
            icon={<UserRoundSearch />}
            title={search ? t("noResults", { query: search }) : t("poolEmpty")}
          />
        ) : (
          <>
            {poolFilter && (
              <div className="flex items-center gap-2 text-sm">
                <AmpelLabel rating={poolFilter} />
                <button
                  className="ml-auto text-xs text-muted-foreground underline"
                  onClick={() => setPoolFilter(null)}
                >
                  {t("showAllCategories")}
                </button>
              </div>
            )}
            {visibleGroups.map(g => (
              <section key={g.rating} className="space-y-2">
                <button
                  type="button"
                  onClick={() => setPoolFilter(poolFilter === g.rating ? null : g.rating)}
                  className="flex items-center gap-2 text-sm"
                >
                  <AmpelLabel rating={g.rating} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {g.items.length}
                  </span>
                </button>
                <div className="grid gap-2">
                  {g.items.map(a => (
                    <ApplicantCard
                      key={a._id}
                      applicant={a}
                      profile={a.profilId ? (profileById.get(a.profilId) ?? null) : null}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!poolFilter && ohneBewertung.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("ampel.offen")} ({ohneBewertung.length})
                </p>
                <div className="grid gap-2">
                  {ohneBewertung.map(a => (
                    <ApplicantCard
                      key={a._id}
                      applicant={a}
                      profile={a.profilId ? (profileById.get(a.profilId) ?? null) : null}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-md"
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<UserRoundSearch />}
          title={search ? t("noResults", { query: search }) : t("neuEmpty")}
        />
      ) : (
        <div className="grid gap-2">
          {list.map(a => (
            <ApplicantCard
              key={a._id}
              applicant={a}
              profile={a.profilId ? (profileById.get(a.profilId) ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
