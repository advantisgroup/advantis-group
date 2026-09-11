"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { MessageSquareHeart } from "lucide-react";
import { useTranslations } from "next-intl";

import { DesignFeedbackDialog } from "@/components/design/DesignFeedbackDialog";
import { Switch } from "@/components/notifications/NotificationPreferences";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useDesignPreview } from "@/lib/design-preview";

export function DesignPreviewSettings() {
  const t = useTranslations("Design");
  const design = useDesignPreview();
  const setPrefs = useMutation(api.userPreferences.setMine);
  const handleError = useErrorHandler();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <SettingsSection title={t("settingsTitle")} description={t("settingsHint")}>
        <SettingsRow
          title={t("refreshedTitle")}
          description={t("refreshedHint")}
          control={
            <Switch
              checked={design === "refreshed"}
              onToggle={() =>
                void setPrefs({
                  designPreview: design === "refreshed" ? "classic" : "refreshed",
                }).catch(handleError)
              }
              label={t("refreshedTitle")}
            />
          }
        />
        <SettingsRow
          title={t("feedbackTitle")}
          description={t("feedbackHint")}
          control={
            <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
              <MessageSquareHeart />
              {t("sendFeedback")}
            </Button>
          }
        />
      </SettingsSection>
      <DesignFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
