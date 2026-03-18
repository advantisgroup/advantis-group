import { type ClerkInstance } from "@/types/clerk";

const CLERK_SCRIPT_ID = "clerk-js-sdk";
let clerkPromise: Promise<ClerkInstance> | null = null;

const normalizeFrontendApiUrl = (value: string) => {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/$/, "");
  }

  return `https://${value.replace(/\/$/, "")}`;
};

const getClerkScriptUrl = () => {
  const frontendApi = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL;

  if (!frontendApi) {
    return null;
  }

  return `${normalizeFrontendApiUrl(frontendApi)}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
};

const ensureClerkScript = async () => {
  if (typeof window === "undefined") {
    throw new Error("Clerk can only load in the browser.");
  }

  if (window.Clerk) {
    return window.Clerk;
  }

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const scriptUrl = getClerkScriptUrl();

  if (!publishableKey || !scriptUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_FRONTEND_API_URL.",
    );
  }

  const existingScript = document.getElementById(
    CLERK_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  if (existingScript && window.Clerk) {
    return window.Clerk;
  }

  await new Promise<void>((resolve, reject) => {
    const script =
      existingScript ??
      Object.assign(document.createElement("script"), {
        id: CLERK_SCRIPT_ID,
        async: true,
        crossOrigin: "anonymous",
        src: scriptUrl,
        type: "text/javascript",
      });

    script.dataset.clerkPublishableKey = publishableKey;

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load the Clerk browser SDK.")),
      { once: true },
    );

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  if (!window.Clerk) {
    throw new Error("Clerk SDK loaded, but window.Clerk is unavailable.");
  }

  return window.Clerk;
};

export const hasClerkBrowserConfig = () =>
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL,
  );

export const loadClerk = async ({
  locale,
  accountPath,
  signInPath,
  signUpPath,
}: {
  locale: string;
  accountPath: string;
  signInPath: string;
  signUpPath: string;
}) => {
  clerkPromise ??= ensureClerkScript();

  const clerk = await clerkPromise;

  await clerk.load({
    locale,
    signInUrl: signInPath,
    signUpUrl: signUpPath,
    signInForceRedirectUrl: accountPath,
    signUpForceRedirectUrl: accountPath,
    signInFallbackRedirectUrl: accountPath,
    signUpFallbackRedirectUrl: accountPath,
    standardBrowser: true,
  });

  return clerk;
};
