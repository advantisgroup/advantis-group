import posthog from "posthog-js";

export type ConsentStatus = "granted" | "denied" | "pending";

/**
 * Deliberately not `has_opted_out_capturing()`: that folds in the
 * `opt_out_capturing_by_default` config, so it already reports "opted out" for
 * a visitor who has never been asked — which is why the banner never appeared.
 * This one only reflects an actual decision, so "pending" really means
 * "hasn't chosen yet".
 */
export const getConsent = (): ConsentStatus => posthog.get_explicit_consent_status();

export const setConsent = (granted: boolean) => {
  if (granted) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
};
