"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type Ampel = "rot" | "blau" | "gruen";

export const AMPEL_ORDER: Ampel[] = ["rot", "blau", "gruen"];

const AMPEL_DOT: Record<Ampel, string> = {
  rot: "bg-destructive",
  blau: "bg-info",
  gruen: "bg-success",
};

const AMPEL_TEXT: Record<Ampel, string> = {
  rot: "text-destructive",
  blau: "text-info",
  gruen: "text-success",
};

const AMPEL_RING: Record<Ampel, string> = {
  rot: "border-destructive bg-destructive/10",
  blau: "border-info bg-info/10",
  gruen: "border-success bg-success/10",
};

/** A small colored dot representing an applicant's Ampel rating. */
export function AmpelDot({
  rating,
  className,
}: {
  rating?: Ampel | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        rating
          ? AMPEL_DOT[rating]
          : "border-2 border-dashed border-muted-foreground/40",
        className
      )}
    />
  );
}

/** Dot + localized label, e.g. for group headers. */
export function AmpelLabel({ rating }: { rating: Ampel }) {
  const t = useTranslations("Applicants");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        AMPEL_TEXT[rating]
      )}
    >
      <AmpelDot rating={rating} />
      {t(`ampel.${rating}`)}
      <span className="font-normal text-muted-foreground">
        – {t(`ampelDesc.${rating}`)}
      </span>
    </span>
  );
}

/** The three-way Ampel picker used on the applicant detail page. */
export function AmpelPicker({
  value,
  onChange,
}: {
  value?: Ampel | null;
  onChange: (rating: Ampel | null) => void;
}) {
  const t = useTranslations("Applicants");
  return (
    <div className="flex flex-wrap gap-2">
      {AMPEL_ORDER.map(rating => {
        const active = value === rating;
        return (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(active ? null : rating)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? AMPEL_RING[rating] + " " + AMPEL_TEXT[rating]
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <AmpelDot rating={rating} />
            {t(`ampel.${rating}`)}
          </button>
        );
      })}
    </div>
  );
}
