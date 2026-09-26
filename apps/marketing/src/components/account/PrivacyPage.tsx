"use client";

import { useState } from "react";

import { INQUIRY_RETENTION_YEARS } from "@advantis/convex/marketing/inquiry";
import { useClerk, useReverification } from "@clerk/nextjs";
import { Archive, Clock3, Download, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/eden";
import type { Consents } from "@/lib/inquiries-server";

import { AccountBackLink } from "./AccountNav";
import { SettingRow, SettingSection } from "./SettingRow";
import { useInquiryFormat } from "./inquiry-format";

/**
 * What we keep and how to take it back: a plain summary first, then one row
 * per thing you can do, with the irreversible one last.
 */
export function PrivacyPage({ consents }: { consents: Consents | null }) {
  const t = useTranslations("account.privacy");
  const format = useInquiryFormat();
  const router = useRouter();
  const withdrawable = (consents?.whitepaper ?? []).filter(
    (lead) => lead.status === "confirmed" && !lead.withdrawnAt,
  );

  const withdraw = async (email: string) => {
    const { error } = await api.account.consents.whitepaper.withdraw.post({ email });
    if (error) toast.error(t("failed"));
    else toast.success(t("consents.withdrawn"));
    router.refresh();
  };

  return (
    <div className="max-w-3xl">
      <AccountBackLink />
      <Display as="h1" size="md">
        {t("title")}
      </Display>

      <ul className="mt-8 max-w-2xl space-y-4">
        {[
          { icon: Archive, text: t("summary.keep") },
          { icon: Clock3, text: t("summary.howLong", { years: INQUIRY_RETENTION_YEARS }) },
          { icon: ShieldCheck, text: t("summary.control") },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3.5 text-[15px] leading-relaxed text-foreground">
            <Icon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
            {text}
          </li>
        ))}
      </ul>
      <p className="mt-5 pl-[1.875rem] text-sm text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          {t("policy")}
        </Link>
      </p>

      <SettingSection title={t("yourData")}>
        <SettingRow label={t("export.label")} description={t("export.description")}>
          <Button asChild size="sm" variant="outline" shape="pill">
            <a href="/api/account/export" download>
              <Download />
              {t("export.cta")}
            </a>
          </Button>
        </SettingRow>
        <DeleteHistory />
      </SettingSection>

      {withdrawable.length || consents?.notify.length ? (
        <SettingSection title={t("consents.title")}>
          {withdrawable.map((lead) => (
            <SettingRow
              key={lead.email}
              label={t("consents.whitepaper")}
              description={t("consents.whitepaperDetail", {
                email: lead.email,
                date: lead.confirmedAt ? format.dateTime.format(lead.confirmedAt) : "",
                version: lead.consentVersion,
              })}
            >
              <Button size="sm" variant="ghost" onClick={() => void withdraw(lead.email)}>
                {t("consents.withdraw")}
              </Button>
            </SettingRow>
          ))}
          {consents?.notify.map((row) => (
            <SettingRow
              key={row.email}
              label={t("consents.notify")}
              description={t("consents.notifyDetail", { email: row.email })}
            >
              <Button asChild size="sm" variant="ghost">
                <Link href="/account/preferences">{t("consents.manage")}</Link>
              </Button>
            </SettingRow>
          ))}
        </SettingSection>
      ) : null}

      <SettingSection title={t("account")}>
        {consents?.staff ? (
          <SettingRow label={t("delete.label")} description={t("delete.staff")} />
        ) : (
          <DeleteAccount email={consents?.primaryEmail ?? ""} />
        )}
      </SettingSection>
    </div>
  );
}

function DeleteHistory() {
  const t = useTranslations("account.privacy.history");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const erase = async () => {
    setBusy(true);
    const { error } = await api.account.inquiries.delete();
    setBusy(false);
    setConfirming(false);
    if (error) toast.error(t("failed"));
    else toast.success(t("done"));
    router.refresh();
  };

  return (
    <SettingRow label={t("label")} description={t("description")}>
      {confirming ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void erase()}>
            {t("confirm")}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" shape="pill" onClick={() => setConfirming(true)}>
          {t("cta")}
        </Button>
      )}
    </SettingRow>
  );
}

function DeleteAccount({ email }: { email: string }) {
  const t = useTranslations("account.privacy.delete");
  const locale = useLocale();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  // Clerk asks for the password (or a code) again before this goes through
  const deleteAccount = useReverification(() =>
    fetch("/api/account/delete", { method: "POST" }).then((response) => response.json()),
  );

  const confirm = async () => {
    setBusy(true);
    try {
      const result = (await deleteAccount()) as { ok?: boolean } | null;
      if (!result?.ok) throw new Error("not deleted");
      toast(t("done"));
      await signOut({ redirectUrl: `/${locale}` });
    } catch {
      toast.error(t("failed"));
      setBusy(false);
    }
  };

  return (
    <div className="py-5">
      <SettingRow label={t("label")} description={t("description")} className="py-0">
        {!open ? (
          <Button
            size="sm"
            variant="outline"
            shape="pill"
            className="text-destructive"
            onClick={() => setOpen(true)}
          >
            {t("cta")}
          </Button>
        ) : null}
      </SettingRow>
      {open ? (
        <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/[0.04] p-4">
          <label htmlFor="delete-confirm" className="text-[15px] text-foreground">
            {t("typeEmail", { email })}
          </label>
          <input
            id="delete-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="mt-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-[15px]"
          />
          <p className="mt-2 text-sm text-muted-foreground">{t("kept")}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() => void confirm()}
            >
              {t("confirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
