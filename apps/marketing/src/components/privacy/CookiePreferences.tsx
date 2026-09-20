import { BarChart3, Cookie, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * There is no toggle here any more, and that's the point: analytics moved
 * off PostHog onto a first-party Convex table that stores no cookie, no IP
 * and no persistent id — just a per-tab `sessionStorage` value that dies
 * when the tab does. Nothing left to consent to, so a preferences UI with a
 * switch would be theatre.
 *
 * The one thing that will earn a real toggle is referral attribution
 * (crediting a signed-in colleague for a share), because that does tie a
 * visit to a named person — that lands with the share-link work.
 */

const ESSENTIAL_USES = ["essential.uses.auth", "essential.uses.account", "essential.uses.safety"];
const ANALYTICS_USES = ["analytics.uses.usage", "analytics.uses.improve"];
const COMMITMENTS = ["commitments.sell", "commitments.train", "commitments.ads"];

const Row = ({
  icon: Icon,
  title,
  badge,
  description,
  usedForLabel,
  items,
}: {
  icon: typeof Lock;
  title: string;
  badge: string;
  description: string;
  usedForLabel: string;
  items: string[];
}) => (
  <div className="rounded-xl border border-rule bg-card p-5 sm:p-6">
    <div className="flex items-start gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-background/60 text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{badge}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

        <div className="mt-4">
          <span className="text-xs text-muted-foreground/70">{usedForLabel}</span>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <li
                key={item}
                className="rounded-md border border-rule px-2 py-1 text-xs text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </div>
);

export const CookiePreferences = () => {
  const t = useTranslations("cookiePreferences");

  return (
    <div className="space-y-3">
      <Row
        icon={Lock}
        title={t("essential.title")}
        badge={t("essential.always")}
        description={t("essential.description")}
        usedForLabel={t("usedFor")}
        items={ESSENTIAL_USES.map((key) => t(key))}
      />

      <Row
        icon={BarChart3}
        title={t("analytics.title")}
        badge={t("analytics.badge")}
        description={t("analytics.description")}
        usedForLabel={t("usedFor")}
        items={ANALYTICS_USES.map((key) => t(key))}
      />

      <p className="px-1 pt-2 text-sm text-muted-foreground">{t("localOnly")}</p>

      <div className="mt-6 rounded-xl border border-rule bg-background/40 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-[-0.01em]">{t("commitments.title")}</h2>
        <ul className="mt-3 space-y-2">
          {COMMITMENTS.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Cookie className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
              <span className="leading-relaxed">{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
