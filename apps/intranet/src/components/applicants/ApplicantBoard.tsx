"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { CalendarClock, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AmpelDot, type Ampel } from "@/components/applicants/AmpelBadge";
import { today } from "@/components/applicants/applicant-types";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type Applicant = FunctionReturnType<typeof api.applicants.list>[number];
type Column = Ampel | "offen";

const COLUMNS: Column[] = ["offen", "gruen", "blau", "rot"];

/** Applicants laid out by traffic-light rating; dragging a card re-rates it. */
export function ApplicantBoard({
  applicants,
  detailHref,
}: {
  applicants: Applicant[];
  detailHref: (applicant: Applicant) => string;
}) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const update = useMutation(api.applicants.update);
  const [dragOver, setDragOver] = useState<Column | null>(null);

  function move(applicantId: Id<"applicants">, column: Column) {
    update({ applicantId, rating: column === "offen" ? null : column }).catch(handleError);
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((column) => {
        const cards = applicants.filter((a) => (a.rating ?? "offen") === column);
        return (
          <section
            key={column}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(column);
            }}
            onDragLeave={() => setDragOver((current) => (current === column ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              const id = event.dataTransfer.getData("text/applicant");
              if (id) move(id as Id<"applicants">, column);
            }}
            className={cn(
              "min-w-0 rounded-xl bg-muted/40 p-2 transition-colors",
              dragOver === column && "bg-accent ring-1 ring-border",
            )}
          >
            <h3 className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-xs font-medium text-muted-foreground">
              <AmpelDot rating={column === "offen" ? null : column} className="size-2" />
              {t(`ampel.${column}`)}
              <span className="ml-auto tabular-nums">{cards.length}</span>
            </h3>
            <ul className="space-y-2">
              {cards.map((a) => (
                <li
                  key={a._id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/applicant", a._id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <Link
                    href={detailHref(a)}
                    data-shortcut-item
                    className="block rounded-lg border border-border/70 bg-card p-3 transition-colors hover:border-border"
                  >
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.position || t("positionUnknown")}
                    </p>
                    {(a.nextOpenTermin || a.documentsCount > 0) && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {a.nextOpenTermin && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              a.nextOpenTermin.datum < today() && "text-destructive",
                            )}
                          >
                            <CalendarClock className="size-3" />
                            {formatIsoDate(a.nextOpenTermin.datum, locale)}
                          </span>
                        )}
                        {a.documentsCount > 0 && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <FileText className="size-3" />
                            {a.documentsCount}
                          </span>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
