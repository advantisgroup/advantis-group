"use client";

import React from "react";

import { useLocale, useTranslations } from "next-intl";

import { useClerkAuth } from "@/components/auth/ClerkAuthProvider";
import { cn } from "@/lib/utils";

type MountVariant = "signIn" | "signUp" | "userProfile" | "userButton";

const mountMethods = {
  signIn: {
    mount: "mountSignIn",
    unmount: "unmountSignIn",
  },
  signUp: {
    mount: "mountSignUp",
    unmount: "unmountSignUp",
  },
  userProfile: {
    mount: "mountUserProfile",
    unmount: "unmountUserProfile",
  },
  userButton: {
    mount: "mountUserButton",
    unmount: "unmountUserButton",
  },
} as const;

export const ClerkMount = ({
  variant,
  className,
}: {
  variant: MountVariant;
  className?: string;
}) => {
  const locale = useLocale();
  const t = useTranslations("auth");
  const { clerk, error, isEnabled, isLoaded, isSignedIn, status } = useClerkAuth();
  const mountRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!clerk || !mountRef.current) {
      return;
    }

    const node = mountRef.current;
    const methods = mountMethods[variant];

    if (variant === "userProfile" && !isSignedIn) {
      return;
    }

    clerk[methods.mount](node, {
      appearance: {
        variables: {
          colorPrimary: "#22c55e",
          colorBackground: "#0b0f14",
          colorInputBackground: "#111827",
          colorText: "#f8fafc",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-manrope)",
        },
      },
      signInUrl: `/${locale}/sign-in`,
      signUpUrl: `/${locale}/sign-up`,
      userProfileUrl: `/${locale}/account`,
      afterSignOutUrl: `/${locale}`,
    });

    return () => {
      clerk[methods.unmount](node);
    };
  }, [clerk, isSignedIn, locale, variant]);

  if (!isEnabled) {
    return (
      <div className={cn("rounded-2xl border border-border bg-card/60 p-6", className)}>
        <p className="text-sm text-muted-foreground">{t("missingConfig")}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={cn("rounded-2xl border border-destructive/30 bg-card/60 p-6", className)}>
        <p className="text-sm text-destructive">{error ?? t("loadError")}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={cn("rounded-2xl border border-border bg-card/60 p-6", className)}>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (variant === "userProfile" && !isSignedIn) {
    return (
      <div className={cn("rounded-2xl border border-border bg-card/60 p-6", className)}>
        <p className="text-sm text-muted-foreground">{t("signInRequired")}</p>
      </div>
    );
  }

  return <div ref={mountRef} className={className} />;
};
