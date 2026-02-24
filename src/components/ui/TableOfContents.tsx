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
  <nav className="space-y-2">
    {sections.map(section => {
      const Icon = section.icon;
      return (
        <button
          key={section.id}
          onClick={() => onSectionClick(section.id)}
          className={cn(
            "w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3 group",
            activeSection === section.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          )}
        >
          <Icon
            className={cn(
              "w-4 h-4 shrink-0",
              activeSection === section.id
                ? "text-primary"
                : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          <span className="text-sm">{section.title}</span>
        </button>
      );
    })}
  </nav>
);
