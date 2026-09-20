"use client";
import React, { useRef, useState } from "react";

import { SignInButton, useUser } from "@clerk/nextjs";
import { CheckCircle2, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CallbackForm } from "@/components/contact/CallbackForm";
import { PageHeader } from "@/components/frame";
import { ContactInfoDesktop, ContactInfoMobile } from "@/components/contact/ContactInfo";
import { MessageForm } from "@/components/contact/MessageForm";
import { NotifyModal } from "@/components/contact/NotifyModal";
import { OtherForm } from "@/components/contact/OtherForm";
import { SubmissionBanner } from "@/components/contact/SubmissionBanner";
import { TabNavigation } from "@/components/contact/TabNavigation";
import { WhyAdvantisSidebar } from "@/components/contact/WhyAdvantis";
import { useContactForm } from "@/hooks/use-contact-form";
import { COMPANY_ADDRESS } from "@/lib/company";
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
      value: COMPANY_ADDRESS,
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
    <div className="min-h-screen bg-background">
      <PageHeader title={t("title")} lede={t("subtitle")} className="md:pb-16" />

      <main className="mx-auto w-full max-w-[1200px] px-5 pb-24 md:px-10">
        <section className="space-y-8 md:space-y-12">
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
            className="overflow-hidden rounded-xl border border-rule bg-card"
          >
            <TabNavigation contactMode={contactMode} onModeChange={setContactMode} />

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="space-y-6 p-6 md:p-8">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-[-0.015em] md:text-2xl">
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
                              ? "border-success/40 bg-success/10 text-success-foreground dark:text-success"
                              : "border-rule-strong text-muted-foreground hover:bg-accent hover:text-foreground",
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
                            className="inline-flex items-center gap-1.5 rounded-full border border-rule-strong px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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

              <div className="border-t border-rule md:border-l md:border-t-0">
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
