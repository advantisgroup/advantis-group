"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Building2, Settings2, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { type OrgUnits } from "./OrgPersonMenu";

const NONE = "none";

/** Admins build the structure from the chart itself: new departments, and new
 *  teams placed straight into a department. */
export function OrgStructureBar({ units }: { units: OrgUnits }) {
  const t = useTranslations("Directory");
  const handleError = useErrorHandler();
  const createDepartment = useMutation(api.org.structure.createDepartment);
  const createTeam = useMutation(api.org.structure.createTeam);
  const [kind, setKind] = useState<"team" | "department" | null>(null);
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState(NONE);
  const [busy, setBusy] = useState(false);

  function open(next: "team" | "department") {
    setName("");
    setDepartmentId(NONE);
    setKind(next);
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (kind === "department") {
        await createDepartment({ name: name.trim() });
      } else {
        await createTeam({
          name: name.trim(),
          departmentId: departmentId === NONE ? undefined : (departmentId as Id<"departments">),
        });
      }
      toast.success(t("orgSaved"));
      setKind(null);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => open("department")}>
        <Building2 />
        {t("orgNewDepartment")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => open("team")}>
        <Users2 />
        {t("orgNewTeam")}
      </Button>
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
        <Link href="/admin/structure">
          <Settings2 />
          {t("orgManageStructure")}
        </Link>
      </Button>

      <ResponsiveDialog
        open={kind !== null}
        onOpenChange={(value) => !value && setKind(null)}
        title={kind === "department" ? t("orgNewDepartment") : t("orgNewTeam")}
        footer={
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            {t("orgCreate")}
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
            placeholder={kind === "department" ? t("orgDepartmentName") : t("orgTeamName")}
          />
          {kind === "team" && (
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("orgMenuNoDepartment")}</SelectItem>
                {units.departments.map((department) => (
                  <SelectItem key={department._id} value={department._id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}
