"use client";

import { type ReactNode } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { CopyLinkButton } from "@/components/applicants/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * Shared detail-modal shell for an applicant sub-resource entry (Kontakt,
 * Email, Interview, Termin): a ResponsiveDialog with the entry's note, a
 * copy-link button, and a delete action gated by `useConfirm`. Closing
 * (any way) navigates back, since these only ever exist as a route layered
 * on top of the resource's list. `confirmTitle`/`confirmDescription` and
 * `extraFooter`/`children` exist for Termin, the one resource with an extra
 * "mark as happened" action and a non-generic delete-confirmation copy.
 */
export function EntryDetailModal({
  href,
  title,
  description,
  note,
  onRemove,
  confirmTitle,
  confirmDescription,
  extraFooter,
  children,
}: {
  href: string;
  title: string;
  description?: string;
  note?: string;
  onRemove: () => Promise<unknown>;
  confirmTitle?: string;
  confirmDescription?: string;
  extraFooter?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  function close() {
    router.back();
  }

  async function handleRemove() {
    const ok = await confirm({
      title: confirmTitle ?? t("deleteEntry"),
      description: confirmDescription,
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    onRemove().then(close).catch(handleError);
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && close()}
      title={title}
      description={description}
      footer={
        <>
          {extraFooter}
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleRemove()}
          >
            {tc("delete")}
          </Button>
        </>
      }
    >
      {note && <p className="text-sm">{note}</p>}
      {children}
      <CopyLinkButton href={href} className="-ml-3" />
    </ResponsiveDialog>
  );
}
