import posthog from "posthog-js"

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://eu.posthog.com",
  defaults: '2025-05-24',
  capture_exceptions: true, 
  debug: process.env.NODE_ENV === "development",
  autocapture: true,
  secure_cookie: true,
  respect_dnt: true,
  opt_in_site_apps: true
});
