"use client";

import { cn } from "@/lib/utils";

interface BrandTextProps {
  brand: "salespirates" | "advantis" | "rodeo" | "oldschool-train" | "sales-ai-germany";
  children: string;
  className?: string;
  hoverable?: boolean;
}

export const BrandText = ({ brand, children, className, hoverable = true }: BrandTextProps) => {
  // Split brand name to highlight first part
  const getParts = (name: string, brandType: string) => {
    if (brandType === "salespirates") {
      if (name.includes("Salespirates")) return ["Sales", "pirates"];
      if (name.includes("Sales-")) {
        const parts = name.split("Sales-");
        return ["Sales", "-" + parts[1]];
      }
      if (name.includes("Sales ")) {
        const parts = name.split("Sales ");
        return ["Sales", " " + parts[1]];
      }
      return ["Sales", name.replace("Sales", "")];
    }
    if (brandType === "advantis") {
      if (name.includes("Advantis")) return ["Advantis", name.replace("Advantis", "")];
      if (name.includes("advantis")) return ["advantis", name.replace("advantis", "")];
      return ["Advantis", name.replace(/Advantis|advantis/i, "")];
    }
    if (brandType === "rodeo") {
      if (name.includes("Rodeo")) return ["Rodeo", name.replace("Rodeo", "")];
      return ["Rodeo", name.replace(/Rodeo/i, "")];
    }
    if (brandType === "oldschool-train") {
      if (name.includes("Oldschool-train")) return ["Oldschool", "train"];
      return ["Oldschool", name.replace("Oldschool-train", "")];
    }
    if (brandType === "sales-ai-germany") {
      if (name.includes("Sales-AI-Germany")) return ["Sales-AI", "Germany"];
      return ["Sales-AI", name.replace("Sales-AI-Germany", "")];
    }
    return [name, ""];
  };

  const [firstPart, rest] = getParts(children, brand);

  const getBrandHoverClass = (brandType: string) => {
    if (brandType === "salespirates") return "group-hover:text-brand-salespirates";
    if (brandType === "advantis") return "group-hover:text-brand-advantis";
    if (brandType === "rodeo") return "group-hover:text-brand-rodeo";
    if (brandType === "oldschool-train") return "group-hover:text-brand-oldschool-train";
    if (brandType === "sales-ai-germany") return "group-hover:text-brand-sales-ai-germany";
    return "";
  };

  const brandColors = {
    salespirates: "text-brand-salespirates",
    advantis: "text-brand-advantis",
    rodeo: "text-brand-rodeo",
    "oldschool-train": "text-brand-oldschool-train",
    "sales-ai-germany": "text-brand-sales-ai-germany",
  };

  return (
    <span className={cn(className, hoverable && "group cursor-pointer inline-block")}>
      <span
        className={cn(
          "transition-colors duration-300",
          hoverable 
            ? cn("text-foreground", getBrandHoverClass(brand))
            : brandColors[brand]
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

