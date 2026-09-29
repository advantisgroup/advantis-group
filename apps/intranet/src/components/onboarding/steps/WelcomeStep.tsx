"use client";

import { motion } from "framer-motion";
import { Bell, Palette, SlidersHorizontal, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { MarkLogo } from "@/components/Logo";
import { useCurrentUser } from "@/components/providers/current-user";

import { rise } from "./step-parts";

const COMING_UP = [
  { key: "profile", icon: UserRound },
  { key: "appearance", icon: Palette },
  { key: "workspace", icon: SlidersHorizontal },
  { key: "notifications", icon: Bell },
] as const;

export function WelcomeStep() {
  const t = useTranslations("Onboarding");
  const user = useCurrentUser();

  return (
    <div className="my-auto flex flex-col items-center py-4 text-center">
      <motion.div variants={rise}>
        <MarkLogo size={44} className="size-11" />
      </motion.div>
      <motion.h2
        variants={rise}
        id="onboarding-title"
        className="mt-6 font-display text-[26px] font-semibold leading-tight tracking-tight md:text-3xl"
      >
        {t("welcomeTitle", { name: user.firstName ?? user.name })}
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground text-pretty"
      >
        {t("welcomeBody")}
      </motion.p>
      <motion.ul
        variants={rise}
        className="mt-8 w-full max-w-sm divide-y divide-border/60 rounded-xl border border-border/70 text-left"
      >
        {COMING_UP.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-center gap-3 px-4 py-3 text-[14px]">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {t(`welcomeItem_${key}`)}
          </li>
        ))}
      </motion.ul>
    </div>
  );
}
