"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InfoTip } from "@/components/activity/InfoTip";
import { AmpelDot } from "@/components/applicants/AmpelBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";

import type { FunctionReturnType } from "convex/server";

type Profile = FunctionReturnType<typeof api.applicants.listProfiles>[number];

interface ProfileFormState {
  _id?: Id<"applicantSkillProfiles">;
  name: string;
  skills: string[];
}

function ProfileForm({
  profile,
  onCancel,
  onSave,
}: {
  profile: ProfileFormState;
  onCancel: () => void;
  onSave: (state: ProfileFormState) => void;
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const [name, setName] = useState(profile.name);
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState(profile.skills);

  function addSkills() {
    const items = skillInput
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    const next = [...skills];
    for (const item of items) {
      if (!next.some(s => s.toLowerCase() === item.toLowerCase()))
        next.push(item);
    }
    setSkills(next);
    setSkillInput("");
  }

  return (
    <>
      <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
        <DialogTitle className="leading-snug">
          {profile._id ? t("editProfile") : t("newProfile")}
        </DialogTitle>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("profileName")}
          </label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("profileNamePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("skills")}
          </label>
          <div className="flex gap-2">
            <Input
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkills();
                }
              }}
              placeholder={t("skillsPlaceholder")}
            />
            <Button type="button" variant="outline" onClick={addSkills}>
              {t("addSkill")}
            </Button>
          </div>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map(s => (
                <Badge key={s} variant="muted" className="gap-1.5 pr-1.5">
                  {s}
                  <button
                    type="button"
                    aria-label={t("removeSkill", { skill: s })}
                    onClick={() => setSkills(skills.filter(x => x !== s))}
                    className="rounded-full px-1 text-muted-foreground hover:bg-background"
                  >
                    ✕
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
        <Button variant="ghost" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button
          disabled={!name.trim()}
          onClick={() => onSave({ ...profile, name: name.trim(), skills })}
        >
          {profile._id ? tc("save") : t("createProfile")}
        </Button>
      </DialogFooter>
    </>
  );
}

function ProfileMatches({ profile }: { profile: Profile }) {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const applicants = useQuery(api.applicants.list);
  const scored = (applicants ?? [])
    .map(a => ({ applicant: a, matched: matchSkills(profile.skills, a) }))
    .filter(x => x.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length);

  if (!applicants) return null;
  if (scored.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">{t("noMatches")}</p>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
      {scored.map(({ applicant, matched }) => (
        <button
          key={applicant._id}
          type="button"
          onClick={() =>
            router.push(
              `/applicants/${applicant._id}/uebersicht?highlight=${encodeURIComponent(matched.join(","))}`
            )
          }
          className="flex w-full items-center gap-3 rounded-lg border border-border/70 p-2.5 text-left text-sm hover:bg-accent/40"
        >
          <AmpelDot rating={applicant.rating} />
          <span className="min-w-0 flex-1 truncate font-medium">
            {applicant.name}
          </span>
          <span className="shrink-0 text-xs font-semibold text-success">
            {matched.length}/{profile.skills.length}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SkillProfilePanel() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const profiles = useQuery(api.applicants.listProfiles);
  const createProfile = useMutation(api.applicants.createProfile);
  const updateProfile = useMutation(api.applicants.updateProfile);
  const removeProfile = useMutation(api.applicants.removeProfile);
  const handleError = useErrorHandler();
  const confirm = useConfirm();

  const [editing, setEditing] = useState<ProfileFormState | null>(null);
  const [matchesFor, setMatchesFor] =
    useState<Id<"applicantSkillProfiles"> | null>(null);

  async function handleDelete(profile: Profile) {
    const ok = await confirm({
      title: t("deleteProfile"),
      description: t("deleteProfileConfirm", { name: profile.name }),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeProfile({ profilId: profile._id })
      .then(() => toast.success(t("profileDeleted")))
      .catch(handleError);
  }

  function handleSave(state: ProfileFormState) {
    if (state._id) {
      updateProfile({
        profilId: state._id,
        name: state.name,
        skills: state.skills,
      })
        .then(() => toast.success(t("profileUpdated")))
        .catch(handleError);
    } else {
      createProfile({ name: state.name, skills: state.skills })
        .then(() => toast.success(t("profileCreated")))
        .catch(handleError);
    }
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1.5">
        <InfoTip text={t("profilesDescription")} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing({ name: "", skills: [] })}
        >
          <Plus className="size-4" />
          {t("newProfile")}
        </Button>
      </div>

      {profiles && profiles.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("noProfiles")}
        </p>
      )}

      <div className="space-y-2">
        {profiles?.map(profile => (
          <Card nested key={profile._id}>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{profile.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {profile.skills.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {t("noSkillsYet")}
                      </span>
                    ) : (
                      profile.skills.map(s => (
                        <Badge key={s} variant="muted" className="text-[10px]">
                          {s}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={profile.skills.length === 0}
                    onClick={() =>
                      setMatchesFor(
                        matchesFor === profile._id ? null : profile._id
                      )
                    }
                  >
                    <Search className="size-4" />
                    {t("findMatches")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setEditing({
                        _id: profile._id,
                        name: profile.name,
                        skills: profile.skills,
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void handleDelete(profile)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {matchesFor === profile._id && (
                <ProfileMatches profile={profile} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          {editing && (
            <ProfileForm
              key={editing._id ?? "new"}
              profile={editing}
              onCancel={() => setEditing(null)}
              onSave={handleSave}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
