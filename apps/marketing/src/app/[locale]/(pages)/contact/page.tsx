"use client";
import React, { useRef, useState } from "react";

import { SignInButton, useUser } from "@clerk/nextjs";
import { CheckCircle2, HelpCircle, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CallbackForm } from "@/components/contact/CallbackForm";
import { MessageForm } from "@/components/contact/MessageForm";
import { NotifyModal } from "@/components/contact/NotifyModal";
import { OtherForm } from "@/components/contact/OtherForm";
import { SubmissionBanner } from "@/components/contact/SubmissionBanner";
import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { useContactForm } from "@/hooks/use-contact-form";
import { useSubmissionsOpen } from "@/hooks/use-submissions-open";
import { Link } from "@/i18n/navigation";
import { COMPANY_ADDRESS } from "@/lib/company";
import { cn } from "@/lib/utils";
import { type ContactInfoItem, type ContactMode } from "@/types/contact";

const SUBMISSION_TEXT_BY_LOCALE: Record<string, string | undefined> = {
  en: process.env.NEXT_PUBLIC_SUBMISSION_TEXT,
  de: process.env.NEXT_PUBLIC_SUBMISSION_TEXT_DE,
  zh: process.env.NEXT_PUBLIC_SUBMISSION_TEXT_ZH,
  fr: process.env.NEXT_PUBLIC_SUBMISSION_TEXT_FR,
};

const MODES = [
  { mode: "message", icon: MessageSquare, label: "writeMessage", short: "writeMessageShort" },
  { mode: "callback", icon: Phone, label: "requestCallback", short: "requestCallbackShort" },
  { mode: "other", icon: HelpCircle, label: "otherInquiries", short: "otherInquiriesShort" },
] as const;

const COPY = {
  message: { title: "writeUs", desc: "writeUsDesc", side: "descriptionMessage" },
  callback: { title: "callback", desc: "callbackDesc", side: "descriptionCallback" },
  other: { title: "otherInquiry", desc: "otherInquiryDesc", side: "descriptionOther" },
} as const;

export default function Kontakt() {
  const t = useTranslations("contact");
  const tTabs = useTranslations("contact.tabs");
  const tMessages = useTranslations("contact.messages");
  const tSidebar = useTranslations("contact.sidebar");
  const tAccount = useTranslations("contact.accountHelper");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const { isSignedIn } = useUser();
  const submissionsOpen = useSubmissionsOpen();
  const formRef = useRef<HTMLDivElement | null>(null);

  const submissionText =
    SUBMISSION_TEXT_BY_LOCALE[locale] ?? process.env.NEXT_PUBLIC_SUBMISSION_TEXT;

  const [contactMode, setContactMode] = useState<ContactMode>("message");
  const [notifyOpen, setNotifyOpen] = useState(false);

  const {
    formData,
    setFormData,
    otherFormData,
    setOtherFormData,
    callbackFormData,
    setCallbackFormData,
    errors,
    otherErrors,
    callbackErrors,
    getButtonState,
    accountProfile,
    sent,
    clearSent,
    handleMessageSubmit,
    handleCallbackSubmit,
    handleOtherSubmit,
  } = useContactForm();

  const channels: ContactInfoItem[] = [
    {
      icon: Mail,
      label: t("email"),
      value: `${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
      href: `mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
    },
    {
      icon: Phone,
      label: t("phone"),
      value: `${process.env.NEXT_PUBLIC_PHONE_NUMBER}`,
      href: `tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`,
    },
    {
      icon: MapPin,
      label: t("address"),
      value: COMPANY_ADDRESS,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(COMPANY_ADDRESS)}`,
    },
  ];

  const copy = COPY[contactMode];

  const switchMode = (mode: ContactMode) => {
    setContactMode(mode);
    clearSent();
  };

  const sendAnother = () => {
    clearSent();
    window.requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const renderForm = () => {
    switch (contactMode) {
      case "message":
        return (
          <MessageForm
            formData={formData}
            errors={errors}
            buttonState={getButtonState("message")}
            disabled={!submissionsOpen}
            onFormDataChange={setFormData}
            onSubmit={handleMessageSubmit}
          />
        );
      case "callback":
        return (
          <CallbackForm
            formData={callbackFormData}
            errors={callbackErrors}
            buttonState={getButtonState("callback")}
            disabled={!submissionsOpen}
            onFormDataChange={setCallbackFormData}
            onSubmit={handleCallbackSubmit}
          />
        );
      case "other":
        return (
          <OtherForm
            formData={otherFormData}
            errors={otherErrors}
            buttonState={getButtonState("other")}
            disabled={!submissionsOpen}
            onFormDataChange={setOtherFormData}
            onSubmit={handleOtherSubmit}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full max-w-[1200px] gap-14 px-5 pt-32 pb-24 md:px-10 md:pt-44 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        {/* The pitch and the ways to reach us without a form. Sticky on wide
            screens so it stays beside a long form instead of scrolling off. */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Display as="h1" size="xl">
            {t("title")}
          </Display>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {tSidebar(copy.side)}
          </p>

          <ul className="mt-10 max-w-md border-t border-rule">
            {channels.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="border-b border-rule">
                <a
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="group flex items-start gap-3 py-4"
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-[13px] text-muted-foreground">{label}</span>
                    <span className="block break-words text-[15px] text-foreground underline-offset-4 group-hover:underline">
                      {value}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </aside>

        <div ref={formRef} className="scroll-mt-28">
          {!submissionsOpen ? (
            <SubmissionBanner
              text={submissionText}
              onNotifyClick={() => setNotifyOpen(true)}
              className="mb-8"
            />
          ) : null}

          <div
            role="group"
            aria-label={t("title")}
            className="inline-flex w-full rounded-full border border-rule p-1 sm:w-auto"
          >
            {MODES.map(({ mode, icon: Icon, label, short }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={contactMode === mode}
                onClick={() => switchMode(mode)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm transition-colors sm:flex-none sm:px-4",
                  contactMode === mode
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                <span className="hidden sm:inline">{tTabs(label)}</span>
                <span className="sm:hidden">{tTabs(short)}</span>
              </button>
            ))}
          </div>

          {sent && sent.mode === contactMode ? (
            <div role="status" className="mt-10 border-t border-rule pt-10">
              <CheckCircle2 aria-hidden className="size-6 text-success" />
              <Display as="h2" size="md" className="mt-5">
                {sent.mode === "callback"
                  ? tMessages("callSuccessTitle")
                  : tMessages("successTitle")}
              </Display>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                {sent.mode === "callback" ? tMessages("callSuccessDesc") : tMessages("successDesc")}{" "}
                {tMessages("copySent", { email: sent.email })}
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {isSignedIn ? (
                  <Button asChild size="sm" className="rounded-full px-4">
                    <Link href="/account/submissions">{tAuth("submissionsCta")}</Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={isSignedIn ? "ghost" : "outline"}
                  className="rounded-full px-4"
                  onClick={sendAnother}
                >
                  {tMessages("sendAnother")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-10">
                <h2 className="text-xl font-medium text-foreground">{tMessages(copy.title)}</h2>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{tMessages(copy.desc)}</p>

                {submissionsOpen ? (
                  <p className="mt-4 text-[13px] text-muted-foreground">
                    {accountProfile ? (
                      tAccount.rich("signedInNote", {
                        email: accountProfile.email,
                        link: (chunks) => (
                          <Link
                            href="/account/submissions"
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            {chunks}
                          </Link>
                        ),
                      })
                    ) : !isSignedIn ? (
                      // modal, so a half-filled form isn't thrown away
                      <SignInButton mode="modal">
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          {tAccount("signInCta")}
                        </button>
                      </SignInButton>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="mt-8">{renderForm()}</div>
            </>
          )}
        </div>
      </main>

      <NotifyModal open={notifyOpen} onOpenChange={setNotifyOpen} />
    </div>
  );
}
