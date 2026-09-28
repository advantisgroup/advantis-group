"use client";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { inquiryTitleParts } from "@advantis/convex/marketing/inquiry";
import { useMutation, useQuery } from "convex/react";
import { Merge } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { StateBadge } from "@/components/inquiries/shared";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";

/**
 * The customer's other inquiries, so a second message about the same thing
 * can be folded into the first instead of answered twice.
 */
export function RelatedInquiries({
  id,
  reference,
  merged,
  format,
}: {
  id: Id<"emails">;
  reference: string;
  /** This one is already folded into another: nothing more to merge. */
  merged: boolean;
  format: Intl.DateTimeFormat;
}) {
  const t = useTranslations("Inquiries");
  const router = useRouter();
  const related = useQuery(api.marketing.inbox.related, { id });
  const merge = useMutation(api.marketing.inbox.merge);
  const confirm = useConfirm();

  if (!related?.length) return null;

  const mergeInto = async (into: Id<"emails">, target: string) => {
    const ok = await confirm({
      title: t("merge.confirmTitle", { source: reference, target }),
      description: t("merge.confirm", { source: reference, target }),
      confirmLabel: t("merge.confirmLabel"),
      cancelLabel: t("notes.cancel"),
    });
    if (!ok) return;
    try {
      await merge({ id, into });
      toast.success(t("merge.done", { target }));
      router.push(`/inquiries/${into}`);
    } catch {
      toast.error(t("merge.failed"));
    }
  };

  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("merge.related")}
      </h2>
      <ul className="mt-2 space-y-2">
        {related.map((other) => {
          const parts = inquiryTitleParts(other);
          const title =
            parts.kind === "text" || parts.kind === "subject"
              ? parts.text
              : t(`types.${other.submissionType}`);
          return (
            <li key={other._id} className="rounded-md border border-border px-3 py-2">
              <Link href={`/inquiries/${other._id}`} className="block hover:underline">
                <span className="line-clamp-1 text-sm">{title}</span>
              </Link>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{other.reference}</span>
                <span aria-hidden>·</span>
                <span>{format.format(other.sentAt)}</span>
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <StateBadge state={other.state} />
                {!merged && other.mergeable ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    title={t("merge.hint", { source: reference, target: other.reference })}
                    onClick={() => void mergeInto(other._id, other.reference)}
                  >
                    <Merge />
                    {t("merge.action")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
