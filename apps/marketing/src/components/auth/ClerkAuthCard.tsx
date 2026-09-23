"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useLocale } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";

export const ClerkAuthCard = ({
  title,
  subtitle,
  variant,
}: {
  title: string;
  subtitle: string;
  variant: "signIn" | "signUp";
}) => {
  const locale = useLocale();

  // `routing="path"` requires `path` to match the URL the component is
  // actually mounted at — with `localePrefix: "always"` (next-intl
  // middleware) that's always `/{locale}/sign-in`, never the bare
  // `/sign-in`. A mismatch here is why Clerk silently fails to render.
  const signInPath = `/${locale}/sign-in`;
  const signUpPath = `/${locale}/sign-up`;
  // Clerk hands this over as-is, so it needs the locale already on it — a bare
  // `/account` bounced through the middleware and picked up a second prefix.
  // A `?redirect_url=` on the page still wins over it.
  const afterAuthPath = `/${locale}/account/submissions`;

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {variant === "signIn" ? (
        <SignIn
          path={signInPath}
          routing="path"
          signUpUrl={signUpPath}
          fallbackRedirectUrl={afterAuthPath}
        />
      ) : (
        <SignUp
          path={signUpPath}
          routing="path"
          signInUrl={signInPath}
          fallbackRedirectUrl={afterAuthPath}
        />
      )}
    </AuthShell>
  );
};
