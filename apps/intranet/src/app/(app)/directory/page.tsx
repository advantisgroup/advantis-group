"use client";

import { useMutation, useQuery } from "convex/react";
import { MessageSquare, Search } from "lucide-react";
import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/format";

export default function DirectoryPage() {
  const t = useTranslations("Directory");
  const tRoles = useTranslations("Roles");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const me = useCurrentUser();

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");

  const departments = useQuery(api.users.departments) ?? [];
  const people = useQuery(api.users.list, {
    search: search || undefined,
    department: department === "all" ? undefined : department,
  });
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);

  async function message(userId: Id<"users">) {
    const { conversationId } = await getOrCreateDm({ otherUserId: userId });
    router.push(`/chat?c=${conversationId}`);
  }

  return (
    <div className="mx-auto max-w-5xl" data-tour="tour-directory-grid">
      <PageHeader title={t("title")} />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder={t("department")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tCommon("all")}</SelectItem>
            {departments.map(d => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {people && people.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("noResults")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people?.map(p => (
            <Card key={p._id}>
              <CardContent className="flex items-center gap-3 p-4">
                <Avatar className="h-12 w-12">
                  {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                  <AvatarFallback>{initials(p.name, p.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <Badge variant="muted" className="shrink-0">
                      {tRoles(p.role)}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.jobTitle || p.email}
                  </p>
                  {p.department && (
                    <p className="truncate text-xs text-muted-foreground">
                      {p.department}
                    </p>
                  )}
                </div>
                {p._id !== me._id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("startChat")}
                    onClick={() => void message(p._id)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
