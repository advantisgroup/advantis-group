"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Building2, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

/** Admins build the structure from the chart itself: new departments
 *  (teams were dropped 11/2026). */
export function OrgStructureBar() {
  const t = useTranslations("Directory");
  const handleError = useErrorHandler();
  const createDepartment = useMutation(api.org.structure.createDepartment);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createDepartment({ name: name.trim() });
      toast.success(t("orgSaved"));
      setOpen(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setName("");
          setOpen(true);
        }}
      >
        <Building2 />
        {t("orgNewDepartment")}
      </Button>
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
        <Link href="/admin/structure">
          <Settings2 />
          {t("orgManageStructure")}
        </Link>
      </Button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("orgNewDepartment")}
        footer={
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            {t("orgCreate")}
          </Button>
        }
      >
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
          placeholder={t("orgDepartmentName")}
        />
      </ResponsiveDialog>
    </div>
  );
}
