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

  const signInPath = `/${locale}/sign-in`;
  const signUpPath = `/${locale}/sign-up`;

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {variant === "signIn" ? (
        <SignIn
          path={signInPath}
          routing="path"
          signUpUrl={signUpPath}
          fallbackRedirectUrl={`/${locale}/account`}
        />
      ) : (
        <SignUp
          path={signUpPath}
          routing="path"
          signInUrl={signInPath}
          fallbackRedirectUrl={`/${locale}/account`}
        />
      )}
    </AuthShell>
  );
};
