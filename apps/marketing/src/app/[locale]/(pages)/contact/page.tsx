"use client";
import React, { useRef, useState } from "react";

import { SignInButton, useUser } from "@clerk/nextjs";
import { CheckCircle2, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CallbackForm } from "@/components/contact/CallbackForm";
import { ContactInfoDesktop, ContactInfoMobile } from "@/components/contact/ContactInfo";
import { MessageForm } from "@/components/contact/MessageForm";
import { NotifyModal } from "@/components/contact/NotifyModal";
import { OtherForm } from "@/components/contact/OtherForm";
import { SubmissionBanner } from "@/components/contact/SubmissionBanner";
import { TabNavigation } from "@/components/contact/TabNavigation";
import { WhyAdvantisSidebar } from "@/components/contact/WhyAdvantis";
import { useContactForm } from "@/hooks/use-contact-form";
import { cn } from "@/lib/utils";
import { type ContactInfoItem, type ContactMode } from "@/types/contact";

const ALLOW_SUBMISSIONS = process.env.NEXT_PUBLIC_ALLOW_SUBMISSIONS === "true";

const SUBMISSION_TEXT_BY_LOCALE: Record<string, string | undefined> = {
  en: process.env.NEXT_PUBLIC_SUBMISSION_TEXT,
  de: process.env.NEXT_PUBLIC_SUBMISSION_TEXT_DE,
  zh: process.env.NEXT_PUBLIC_SUBMISSION_TEXT_ZH,
  fr: process.env.NEXT_PUBLIC_SUBMISSION_TEXT_FR,
};

export default function Kontakt() {
  const t = useTranslations("contact");
  const tMessages = useTranslations("contact.messages");
  const tAccountHelper = useTranslations("contact.accountHelper");
  const locale = useLocale();
  const { isSignedIn } = useUser();
  const formSectionRef = useRef<HTMLElement | null>(null);

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
    accountPrefillState,
    applyAccountProfile,
    handleMessageSubmit,
    handleCallbackSubmit,
    handleOtherSubmit,
  } = useContactForm();

  const contactInfoData: ContactInfoItem[] = [
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
      value: `${process.env.NEXT_PUBLIC_ADRESS}`,
      href: "#",
    },
  ];

  const getFormTitle = () => {
    switch (contactMode) {
      case "message":
        return tMessages("writeUs");
      case "callback":
        return tMessages("callback");
      case "other":
        return tMessages("otherInquiry");
      default:
        return tMessages("writeUs");
    }
  };

  const getFormDescription = () => {
    switch (contactMode) {
      case "message":
        return tMessages("writeUsDesc");
      case "callback":
        return tMessages("callbackDesc");
      case "other":
        return tMessages("otherInquiryDesc");
      default:
        return tMessages("writeUsDesc");
    }
  };

  const handleUseAccount = () => {
    const didApply = applyAccountProfile();

    if (!didApply) {
      return;
    }

    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const renderForm = () => {
    switch (contactMode) {
      case "message":
        return (
          <MessageForm
            formData={formData}
            errors={errors}
            buttonState={getButtonState("message")}
            disabled={!ALLOW_SUBMISSIONS}
            onFormDataChange={setFormData}
            onSubmit={handleMessageSubmit}
          />
        );
      case "callback":
        return (
          <CallbackForm
            formData={callbackFormData}
            errors={callbackErrors}
            disabled={!ALLOW_SUBMISSIONS}
            buttonState={getButtonState("callback")}
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
            disabled={!ALLOW_SUBMISSIONS}
            onFormDataChange={setOtherFormData}
            onSubmit={handleOtherSubmit}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <main className="container mx-auto space-y-16 px-4 pb-24 pt-24 md:space-y-24">
        <section className="mx-auto max-w-4xl space-y-6 text-center md:space-y-8">
          <h1 className="text-4xl font-bold md:text-5xl lg:text-7xl">{t("title")}</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
            {t("subtitle")}
          </p>
        </section>

        <section className="mx-auto max-w-6xl space-y-8 md:space-y-12">
          <div className="md:hidden">
            <ContactInfoMobile items={contactInfoData} />
          </div>
          <div className="hidden md:block">
            <ContactInfoDesktop items={contactInfoData} />
          </div>

          {!ALLOW_SUBMISSIONS && (
            <SubmissionBanner text={submissionText} onNotifyClick={() => setNotifyOpen(true)} />
          )}

          <section
            ref={formSectionRef}
            className="overflow-hidden rounded-4xl border border-border/70 bg-background/70 shadow-xl shadow-black/5"
          >
            <TabNavigation contactMode={contactMode} onModeChange={setContactMode} />

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="space-y-6 p-6 md:p-8">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
                    {getFormTitle()}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="text-base text-muted-foreground">{getFormDescription()}</p>
                    {ALLOW_SUBMISSIONS &&
                      (accountProfile ? (
                        <button
                          type="button"
                          onClick={handleUseAccount}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            accountPrefillState === "success"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-advantis/25 bg-advantis/8 text-advantis hover:bg-advantis/15",
                          )}
                        >
                          {accountPrefillState === "success" ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              {tAccountHelper("useAccountSuccess")}
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              {tAccountHelper("useAccount")}
                            </>
                          )}
                        </button>
                      ) : !isSignedIn ? (
                        <SignInButton>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Sparkles className="h-3 w-3" />
                            {tAccountHelper("signInCta")}
                          </button>
                        </SignInButton>
                      ) : null)}
                  </div>
                </div>

                {renderForm()}
              </div>

              <div className="border-t border-border/70 md:border-l md:border-t-0">
                <WhyAdvantisSidebar contactMode={contactMode} />
              </div>
            </div>
          </section>
        </section>
      </main>

      <NotifyModal open={notifyOpen} onOpenChange={setNotifyOpen} />
    </div>
  );
}
