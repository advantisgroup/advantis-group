"use client";
import { cn } from "@/lib/utils";

interface BrandTextProps {
  brand: "salespirates" | "advantis" | "rodeo" | "oldschool-train" | "sales-ai-germany";
  children: string;
  className?: string;
  hoverable?: boolean;
  keepRestColor?: boolean;
  groupHover?: boolean
}

const BRAND_CONFIGS = {
  salespirates: {
    split: (name: string) => {
      if (name.includes("Salespirates")) return ["Sales", "pirates"];
      if (name.includes("Sales-")) return name.split(/-(.+)/);
      if (name.includes("Sales ")) return name.split(/ (.+)/);
      return ["Sales", name.replace("Sales", "")];
    },
    color: "text-salespirates",
    hoverColor: "group-hover:text-salespirates",
  },
  advantis: {
    split: (name: string) => {
      const match = name.match(/(Advantis|advantis)(.*)/) || [];
      return [match[1] || "Advantis", match[2] || ""];
    },
    color: "text-advantis",
    hoverColor: "group-hover:text-advantis",
  },
  rodeo: {
    split: (name: string) => {
      const match = name.match(/(Rodeo)(.*)/) || [];
      return [match[1] || "Rodeo", match[2] || ""];
    },
    color: "text-rodeo",
    hoverColor: "group-hover:text-rodeo",
  },
  "oldschool-train": {
    split: (name: string) => {
      if (name.includes("Oldschool-train")) return ["Oldschool", "-train"];
      return ["Oldschool", name.replace("Oldschool", "")];
    },
    color: "text-oldschool",
    hoverColor: "group-hover:text-oldschool",
  },
  "sales-ai-germany": {
    split: (name: string) => {
      if (name.includes("Sales-AI-Germany")) {
        return ["Sales-AI", "-Germany"];
      }
      if (name.includes("Sales-AI")) {
        return ["Sales-AI", name.replace("Sales-AI", "")];
      }
      return ["Sales-AI", ""];
    },
    color: "text-sales-ai",
    hoverColor: "group-hover:text-sales-ai",
  },
} as const;

export const BrandText = ({ brand, children, className, hoverable = true, keepRestColor = false, groupHover = false }: BrandTextProps) => {
  const config = BRAND_CONFIGS[brand];
  const [firstPart, rest] = config.split(children);

  return (
    <span className={cn(className, hoverable && "group cursor-pointer inline-block")}>
      <span
        className={cn(
          "transition-colors duration-300",
          hoverable ? groupHover ? cn("text-foreground", config.hoverColor) : config.hoverColor : keepRestColor ? config.color : "",
        )}
      >
        {firstPart}
      </span>
      {rest && (
        <span className={cn("transition-colors duration-300", hoverable ? keepRestColor ? "" : "group-hover:text-foreground/70" : "", groupHover ? "group-hover:text-foreground" : "")}>
          {rest}
        </span>
      )}
    </span>
  );
};