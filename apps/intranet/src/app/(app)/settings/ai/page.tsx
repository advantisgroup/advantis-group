"use client";

import { useTranslations } from "next-intl";

import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";

/** The AI features that can start a run, in the order someone meets them. */
const FEATURES = [
  "wikiChat",
  "wikiFormat",
  "wikiMeta",
  "coachReport",
  "coachEod",
  "coachWikiExtract",
  "cvExtract",
  "cvRescan",
  "ask",
] as const;

/**
 * What the AI can see, in plain words.
 *
 * Every line here is something the code actually does — where a feature sends
 * text, what is kept, for how long, and who else can see it. An assistant
 * inside an intranet holding absences and HR documents only gets used if
 * that's answerable without asking an engineer.
 */
export default function SettingsAiPage() {
  const t = useTranslations("Ai");

  return (
    <>
      <SettingsSection title={t("privacy.featuresTitle")} description={t("privacy.featuresHint")}>
        {FEATURES.map((feature) => (
          <SettingsRow
            key={feature}
            title={t(`kind.${feature}`)}
            description={t(`privacy.feature.${feature}`)}
          />
        ))}
      </SettingsSection>

      <SettingsSection title={t("privacy.whereTitle")} description={t("privacy.whereHint")}>
        <SettingsRow title={t("privacy.provider")} description={t("privacy.providerBody")} />
        <SettingsRow title={t("privacy.storage")} description={t("privacy.storageBody")} />
        <SettingsRow title={t("privacy.retention")} description={t("privacy.retentionBody")} />
      </SettingsSection>

      <SettingsSection title={t("privacy.whoTitle")} description={t("privacy.whoHint")}>
        <SettingsRow title={t("privacy.youSee")} description={t("privacy.youSeeBody")} />
        <SettingsRow title={t("privacy.managersSee")} description={t("privacy.managersSeeBody")} />
        <SettingsRow title={t("privacy.ratings")} description={t("privacy.ratingsBody")} />
      </SettingsSection>

      <SettingsSection title={t("privacy.controlTitle")} description={t("privacy.controlHint")}>
        <SettingsRow title={t("privacy.stop")} description={t("privacy.stopBody")} />
        <SettingsRow title={t("privacy.review")} description={t("privacy.reviewBody")} />
      </SettingsSection>
    </>
  );
}
