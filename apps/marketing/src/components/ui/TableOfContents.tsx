import { cn } from "@/lib/utils";
import { type LucideProps } from "lucide-react";

export const TableOfContents = ({
  sections,
  activeSection,
  onSectionClick,
}: {
  sections: Array<{
    id: string;
    icon: React.ForwardRefExoticComponent<
      Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
    >;
    title: string;
  }>;
  activeSection: string;
  onSectionClick: (id: string) => void;
}) => (
  <nav className="border-t border-rule">
    {sections.map((section) => {
      const Icon = section.icon;
      return (
        <button
          key={section.id}
          onClick={() => onSectionClick(section.id)}
          className={cn(
            "group flex w-full items-center gap-3 border-b border-rule py-3 text-left text-sm transition-colors",
            activeSection === section.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4 shrink-0",
              activeSection === section.id
                ? "text-primary"
                : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span className="text-sm">{section.title}</span>
        </button>
      );
    })}
  </nav>
);
