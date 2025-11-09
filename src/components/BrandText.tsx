"use client";
import { cn } from "@/lib/utils";

interface BrandTextProps {
  brand: "salespirates" | "advantis" | "rodeo" | "oldschool-train" | "sales-ai-germany";
  children: string;
  className?: string;
  hoverable?: boolean;
}

const BRAND_CONFIGS = {
  salespirates: {
    patterns: ["Salespirates", "Sales-", "Sales "],
    split: (name: string) => {
      if (name.includes("Salespirates")) return ["Sales", "pirates"];
      if (name.includes("Sales-")) return name.split(/-(.+)/);
      if (name.includes("Sales ")) return name.split(/ (.+)/);
      return ["Sales", name.replace("Sales", "")];
    },
    color: "text-brand-salespirates",
    hoverColor: "group-hover:text-brand-salespirates",
  },
  advantis: {
    split: (name: string) => {
      const match = name.match(/(Advantis|advantis)(.*)/) || [];
      return [match[1] || "Advantis", match[2] || ""];
    },
    color: "text-brand-advantis",
    hoverColor: "group-hover:text-brand-advantis",
  },
  rodeo: {
    split: (name: string) => {
      const match = name.match(/(Rodeo)(.*)/) || [];
      return [match[1] || "Rodeo", match[2] || ""];
    },
    color: "text-brand-rodeo",
    hoverColor: "group-hover:text-brand-rodeo",
  },
  "oldschool-train": {
    split: (name: string) => {
      if (name.includes("Oldschool-train")) return name.split(/-(.+)/);
      return ["Oldschool", name.replace("Oldschool", "")];
    },
    color: "text-brand-oldschool-train",
    hoverColor: "group-hover:text-brand-oldschool-train",
  },
  "sales-ai-germany": {
    split: (name: string) => {
      if (name.includes("Sales-AI-Germany")) return name.split(/Germany/);
      return ["Sales-AI-", name.replace("Sales-AI-", "")];
    },
    color: "text-brand-sales-ai-germany",
    hoverColor: "group-hover:text-brand-sales-ai-germany",
  },
} as const;

export const BrandText = ({ brand, children, className, hoverable = true }: BrandTextProps) => {
  const config = BRAND_CONFIGS[brand];
  const [firstPart, rest] = config.split(children);

  return (
    <span className={cn(className, hoverable && "group cursor-pointer inline-block")}>
      <span
        className={cn(
          "transition-colors duration-300",
          hoverable ? cn("text-foreground", config.hoverColor) : config.color
        )}
      >
        {firstPart}
      </span>
      {rest && (
        <span className={cn("transition-colors duration-300", hoverable && "group-hover:text-foreground/70")}>
          {rest}
        </span>
      )}
    </span>
  );
};