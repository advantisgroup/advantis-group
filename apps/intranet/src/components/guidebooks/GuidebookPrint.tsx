"use client";

import type { ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { PrintSection, PrintSheet, PrintTitle } from "@/components/print/PrintSheet";
import { formatIsoDate } from "@/lib/format";
import { isExpired, msToDateInput, needsReview } from "@/lib/wiki";

import type { FunctionReturnType } from "convex/server";

type WikiEntry = NonNullable<FunctionReturnType<typeof api.wiki.entries.get>>;

/**
 * A guidebook as a handout: the title and whose it is up top, the article at
 * reading width, the attachments it points at by name, and a line on every
 * sheet saying where the live version is — a printed guide goes stale the day
 * someone edits it, and the reader has no other way to tell.
 */
export function GuidebookPrint({
  slug,
  title,
  description,
  entry,
  children,
}: {
  slug: string;
  title: string;
  description?: string;
  /** Set for wiki entries, which carry an owner, validity and version. */
  entry?: WikiEntry | null;
  children: ReactNode;
}) {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const attachments = useQuery(api.guidebooks.attachments.list, { slug });
  // PrintSheet renders nothing until after mount, so the server's relative
  // fallback never reaches the DOM and can't cause a hydration mismatch.
  const url =
    typeof window === "undefined"
      ? `/guidebooks/${slug}`
      : `${window.location.origin}/guidebooks/${slug}`;
  const day = (ms: number) => formatIsoDate(msToDateInput(ms), locale);

  return (
    <PrintSheet
      title={title}
      area={t("title")}
      kind={t("eyebrow")}
      notice={t("printNotice", { url })}
    >
      <PrintTitle
        eyebrow={entry?.categoryName ?? undefined}
        title={title}
        lead={entry ? undefined : description}
      >
        {entry && (
          <>
            <span>{t("versionMeta", { version: entry.version })}</span>
            <span>{t("printOwner", { name: entry.ownerName ?? entry.authorName })}</span>
            <span>
              {t("printValidity", { from: day(entry.validFrom), until: day(entry.validUntil) })}
            </span>
            {isExpired(entry) ? (
              <span className="font-semibold text-foreground">{t("expiredBadge")}</span>
            ) : (
              needsReview(entry) && (
                <span className="font-semibold text-foreground">{t("reviewDueBadge")}</span>
              )
            )}
            {entry.tags.length > 0 && <span>{entry.tags.map((tag) => `#${tag}`).join(" ")}</span>}
          </>
        )}
      </PrintTitle>

      {children}

      {entry?.link && (
        <p className="mt-[5mm] break-all text-[9pt]">
          <span className="text-muted-foreground">{t("fieldLink")}: </span>
          {entry.link}
        </p>
      )}

      {attachments && attachments.length > 0 && (
        <PrintSection title={t("attachmentsTitle")} className="mt-[9mm]">
          <ul className="list-disc space-y-[1mm] pl-[5mm]">
            {attachments.map((attachment) => (
              <li key={attachment._id}>{attachment.name}</li>
            ))}
          </ul>
        </PrintSection>
      )}
    </PrintSheet>
  );
}
