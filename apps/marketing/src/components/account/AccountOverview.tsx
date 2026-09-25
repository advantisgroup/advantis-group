"use client";

import { useEffect, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { ArrowRight, ArrowUpRight, FileText, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { Link } from "@/i18n/navigation";
import { useTrackOnce } from "@/lib/analytics";
import type { InquiryList } from "@/lib/inquiries-server";

import { AccountSectionList } from "./AccountNav";
import { CheckpointNote } from "./Checkpoints";
import { isUpcomingCallback, useInquiryFormat } from "./inquiry-format";
import { StateLabel } from "./StateLabel";

// an account this fresh gets a hello instead of an empty dashboard
const NEW_ACCOUNT_MS = 30 * 60 * 1000;

const greetingKey = (hour: number) =>
  hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

/**
 * The account's front page: who you are, what's coming up, what you sent
 * last, and the three things people come here to do.
 */
export function AccountOverview({ data }: { data: InquiryList | null }) {
  useTrackOnce("Account - Opened");
  const t = useTranslations("account.overview");
  const format = useInquiryFormat();
  const { user } = useUser();
  const intranetUrl = useCompanyIntranetUrl();
  // the hour is the reader's, so it's only known in the browser
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => setGreeting(greetingKey(new Date().getHours())), []);

  const inquiries = data?.submissions ?? [];
  const upcoming = inquiries
    .filter(isUpcomingCallback)
    .sort((a, b) => a.desiredAt! - b.desiredAt!)[0];
  const isNew = user?.createdAt ? Date.now() - user.createdAt.getTime() < NEW_ACCOUNT_MS : false;
  const firstName = user?.firstName;

  const actions = [
    {
      href: { pathname: "/contact", query: { mode: "message" } },
      icon: MessageSquare,
      label: t("actions.message"),
    },
    {
      href: { pathname: "/contact", query: { mode: "callback" } },
      icon: Phone,
      label: t("actions.callback"),
    },
    { href: { pathname: "/whitepaper" }, icon: FileText, label: t("actions.whitepaper") },
  ];

  return (
    <div className="max-w-3xl">
      <Display as="h1" size="md" className="min-h-[1.15em]">
        {greeting
          ? firstName
            ? t(`greeting.${greeting}`, { name: firstName })
            : t(`greetingNoName.${greeting}`)
          : " "}
      </Display>
      {user ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {[
            user.primaryEmailAddress?.emailAddress,
            user.createdAt
              ? t("memberSince", {
                  date: new Intl.DateTimeFormat(format.locale, {
                    month: "long",
                    year: "numeric",
                  }).format(user.createdAt),
                })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {isNew ? (
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-foreground">{t("welcome")}</p>
      ) : null}

      {intranetUrl ? (
        <CheckpointNote
          title={t("workAccount.title")}
          action={
            <a
              href={`${intranetUrl}/settings/account`}
              className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("workAccount.cta")}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          }
        >
          {t("workAccount.body")}
        </CheckpointNote>
      ) : null}

      {upcoming ? (
        <CheckpointNote
          title={t("comingUp")}
          detail={format.full.format(upcoming.desiredAt!)}
          action={
            <Link
              href={`/account/submissions/${upcoming._id}`}
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("view")}
            </Link>
          }
        >
          {upcoming.callbackStatus === "confirmed"
            ? t("callbackConfirmed")
            : t("callbackRequested")}
        </CheckpointNote>
      ) : null}

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-medium text-foreground">{t("recent")}</h2>
          {inquiries.length ? (
            <Link
              href="/account/submissions"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {t("seeAll")}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </div>
        {inquiries.length ? (
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {inquiries.slice(0, 3).map((inquiry) => (
              <li key={inquiry._id}>
                <Link
                  href={`/account/submissions/${inquiry._id}`}
                  className="-mx-3 flex items-baseline justify-between gap-6 rounded-lg px-3 py-4 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-[15px] text-foreground">
                      {format.title(inquiry).title}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="tabular-nums">{inquiry.reference}</span>
                      <span aria-hidden>·</span>
                      <StateLabel state={inquiry.state} />
                    </span>
                  </span>
                  <time
                    title={format.full.format(inquiry.sentAt)}
                    className="shrink-0 text-sm tabular-nums text-muted-foreground"
                  >
                    {format.when(inquiry.sentAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-y border-rule py-6 text-[15px] text-muted-foreground">
            {t("noInquiries")}
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-[15px] font-medium text-foreground">{t("start")}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {actions.map(({ href, icon: Icon, label }) => (
            <li key={label}>
              <Link
                href={href}
                className="flex h-full items-center gap-3 rounded-lg border border-rule px-4 py-3.5 text-[15px] text-foreground transition-colors hover:bg-accent"
              >
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12">
        <AccountSectionList />
      </div>
    </div>
  );
}
