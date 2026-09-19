"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useKeepReturnTo } from "@/lib/return-to";

export function PasskeySignInLink() {
  const t = useTranslations("Settings");
  const href = useKeepReturnTo("/sign-in/passkey");

  return (
    <div className="mt-4 w-full max-w-sm border-t border-border/70 pt-4 text-center">
      <Button asChild variant="outline" className="w-full">
        <Link href={href}>
          <KeyRound className="size-4" />
          {t("signInWithPasskey")}
        </Link>
      </Button>
    </div>
  );
}
