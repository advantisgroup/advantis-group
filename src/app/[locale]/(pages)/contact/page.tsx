"use client";
import React, { useState } from "react";

import { SignInButton, useUser } from "@clerk/nextjs";
import { Mail, MapPin, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AccountContactHelper } from "@/components/contact/AccountContactHelper";
import { CallbackForm } from "@/components/contact/CallbackForm";
import {
  ContactInfoDesktop,
  ContactInfoMobile,
} from "@/components/contact/ContactInfo";
import { MessageForm } from "@/components/contact/MessageForm";
import { NotifyModal } from "@/components/contact/NotifyModal";
import { OtherForm } from "@/components/contact/OtherForm";
import { SubmissionBanner } from "@/components/contact/SubmissionBanner";
import { TabNavigation } from "@/components/contact/TabNavigation";
import { WhyAdvantisSidebar } from "@/components/contact/WhyAdvantis";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useContactForm } from "@/hooks/use-contact-form";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const { isSignedIn } = useUser();

  const submissionText =
    SUBMISSION_TEXT_BY_LOCALE[locale] ??
    process.env.NEXT_PUBLIC_SUBMISSION_TEXT;

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
            isMobile={isMobile}
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
          {isMobile ? (
            <ContactInfoMobile items={contactInfoData} />
          ) : (
            <ContactInfoDesktop items={contactInfoData} />
          )}

          {accountProfile ? (
            <AccountContactHelper
              accountProfile={accountProfile}
              onUseAccount={applyAccountProfile}
            />
          ) : (
            <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-foreground">
                {tAccountHelper("signedOutTitle")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {tAccountHelper("signedOutDescription")}
              </p>
              <div className="mt-4">
                <SignInButton>
                  <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                    {tAccountHelper("signInCta")}
                  </button>
                </SignInButton>
              </div>
            </div>
          )}

          {!ALLOW_SUBMISSIONS && (
            <SubmissionBanner
              text={submissionText}
              onNotifyClick={() => setNotifyOpen(true)}
            />
          )}

          <div className="overflow-hidden rounded-[2rem] border border-border bg-card/30 shadow-2xl shadow-black/10">
            <TabNavigation
              contactMode={contactMode}
              onModeChange={setContactMode}
            />

            <div
              className={`grid ${isMobile ? "grid-cols-1" : "md:grid-cols-2 divide-x"} divide-border`}
            >
              <Card className={`border-0 rounded-none ${isMobile ? "border-b" : ""}`}>
                <CardHeader>
                  <CardTitle className="text-xl md:text-2xl">
                    {getFormTitle()}
                  </CardTitle>
                  <CardDescription>{getFormDescription()}</CardDescription>
                  {isSignedIn ? (
                    <p className="rounded-xl border border-advantis/20 bg-advantis/5 px-3 py-2 text-sm text-muted-foreground">
                      {tAccountHelper("storedAccountNote")}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent>{renderForm()}</CardContent>
              </Card>

              <WhyAdvantisSidebar contactMode={contactMode} />
            </div>
          </div>
        </section>
      </main>

      <NotifyModal open={notifyOpen} onOpenChange={setNotifyOpen} />
    </div>
  );
}
