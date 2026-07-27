"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function WhoBar({
  label,
  variant = "default",
  onLogout,
}: {
  label: string;
  variant?: "default" | "secondary";
  onLogout: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <Badge variant={variant}>{label}</Badge>
      <Button size="sm" variant="ghost" onClick={onLogout}>
        Abmelden
      </Button>
    </div>
  );
}
