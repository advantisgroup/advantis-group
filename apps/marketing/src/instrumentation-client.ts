import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
  defaults: "2026-01-30",
  capture_exceptions: true,
  debug: process.env.NODE_ENV === "development",
  autocapture: true,
  secure_cookie: true,
  respect_dnt: true,
  // GDPR: don't capture anything until the cookie banner records a choice.
  // `CookieBanner` calls opt_in_capturing()/opt_out_capturing(); either call
  // persists the decision (localStorage) so this stays opted out on repeat
  // visits until the visitor actually says yes.
  opt_out_capturing_by_default: true,
});
