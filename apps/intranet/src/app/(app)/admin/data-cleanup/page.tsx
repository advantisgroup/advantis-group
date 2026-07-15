"use client";

import { type ReactNode, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Building2, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
import { useErrorHandler } from "@/hooks/use-error-handler";

type ReviewBucket = Doc<"orgDataMigrationReview">;

function statusVariant(status: ReviewBucket["status"]): BadgeProps["variant"] {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "muted";
    default:
      return "warning";
  }
}

function BucketRow({
  bucket,
  buckets,
  t,
}: {
  bucket: ReviewBucket;
  buckets: ReviewBucket[];
  t: ReturnType<typeof useTranslations>;
}) {
  const handleError = useErrorHandler();
  const setCanonicalName = useMutation(api.orgDataMigration.setCanonicalName);
  const setStatus = useMutation(api.orgDataMigration.setStatus);
  const mergeBucket = useMutation(api.orgDataMigration.mergeBucket);
  const [name, setName] = useState(bucket.canonicalName);
  const [mergeTarget, setMergeTarget] = useState<string>("");

  const mergedInto = bucket.mergedIntoId
    ? buckets.find(b => b._id === bucket.mergedIntoId)
    : null;
  const mergeCandidates = buckets.filter(
    b => b._id !== bucket._id && !b.mergedIntoId
  );

  if (mergedInto) {
    return (
      <Card className="opacity-60">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="text-sm font-medium line-through">
              {bucket.canonicalName}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("dataCleanup.mergedInto", { name: mergedInto.canonicalName })}
            </p>
          </div>
          <Badge variant="muted">{t("dataCleanup.merged")}</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== bucket.canonicalName) {
                setCanonicalName({
                  bucketId: bucket._id,
                  canonicalName: name.trim(),
                }).catch(handleError);
              }
            }}
            className="max-w-xs"
          />
          <Badge variant={statusVariant(bucket.status)}>
            {t(`dataCleanup.status_${bucket.status}`)}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("dataCleanup.rawValues")}: {bucket.rawValues.join(", ")}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {bucket.status !== "approved" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setStatus({ bucketId: bucket._id, status: "approved" }).catch(
                  handleError
                )
              }
            >
              {t("dataCleanup.approve")}
            </Button>
          )}
          {bucket.status !== "rejected" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setStatus({ bucketId: bucket._id, status: "rejected" }).catch(
                  handleError
                )
              }
            >
              {t("dataCleanup.reject")}
            </Button>
          )}
          {mergeCandidates.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={mergeTarget} onValueChange={setMergeTarget}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue
                    placeholder={t("dataCleanup.mergeIntoPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {mergeCandidates.map(c => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.canonicalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                disabled={!mergeTarget}
                onClick={() => {
                  mergeBucket({
                    sourceId: bucket._id,
                    targetId: mergeTarget as Id<"orgDataMigrationReview">,
                  })
                    .then(() => setMergeTarget(""))
                    .catch(handleError);
                }}
              >
                {t("dataCleanup.merge")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BucketSection({
  kind,
  icon,
  title,
}: {
  kind: "department" | "team";
  icon: ReactNode;
  title: string;
}) {
  const t = useTranslations("Admin");
  const buckets = useQuery(api.orgDataMigration.listReview, { kind });

  const pendingCount = useMemo(
    () =>
      (buckets ?? []).filter(b => b.status === "pending" && !b.mergedIntoId)
        .length,
    [buckets]
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
          {icon}
        </span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {pendingCount > 0 && (
          <Badge variant="warning">
            {t("dataCleanup.pendingCount", { count: pendingCount })}
          </Badge>
        )}
      </div>
      {buckets === undefined ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("dataCleanup.loading")}
        </p>
      ) : buckets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("dataCleanup.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {buckets.map(b => (
            <BucketRow key={b._id} bucket={b} buckets={buckets} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataCleanupPage() {
  const t = useTranslations("Admin");
  const isAdmin = useCurrentUser().role === "admin";
  const handleError = useErrorHandler();

  const populateReview = useMutation(api.orgDataMigration.populateReview);
  const runBackfill = useMutation(api.orgDataMigration.runBackfill);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  async function onPopulate() {
    setBusy(true);
    try {
      const result = await populateReview({});
      toast.success(
        t("dataCleanup.populated", {
          created: result.created,
          updated: result.updated,
        })
      );
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onBackfill() {
    setBusy(true);
    try {
      const result = await runBackfill({});
      toast.success(
        t("dataCleanup.backfilled", {
          departments: result.departmentsCreated,
          teams: result.teamsCreated,
          users: result.usersUpdated,
        })
      );
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={t("title")}
        title={t("dataCleanup.title")}
        description={t("dataCleanup.description")}
        icon={<Building2 />}
        action={
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onPopulate}>
              {t("dataCleanup.populate")}
            </Button>
            <Button disabled={busy} onClick={onBackfill}>
              {t("dataCleanup.runBackfill")}
            </Button>
          </div>
        }
      />

      <BucketSection
        kind="department"
        icon={<Building2 />}
        title={t("dataCleanup.departments")}
      />
      <BucketSection
        kind="team"
        icon={<Users2 />}
        title={t("dataCleanup.teams")}
      />
    </div>
  );
}
