"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useConvex } from "convex/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";

import { ACADEMY_ID } from "./use-academy-progress";

/** Participant entry: an access code is the whole credential — no intranet
 * account needed, so external invitees (candidates, partners, ...) can take
 * the training too, same as the original standalone tool. */
export function ParticipantLogin({
  onLogin,
}: {
  onLogin: (participant: {
    id: Id<"academyParticipants">;
    name: string;
  }) => void;
}) {
  const convex = useConvex();

  // An invitation's "Open the training" link/button carries the access
  // code as ?code= so the participant doesn't have to copy-paste or retype
  // it from the email.
  const codeFromInvite = useDeepLinkId("code");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (codeFromInvite) setCode(codeFromInvite.toUpperCase());
  }, [codeFromInvite]);

  async function submit() {
    setChecking(true);
    setCodeError("");
    try {
      const participant = await convex.query(
        api.academyParticipants.findByCode,
        {
          academyId: ACADEMY_ID,
          code,
        }
      );
      if (!participant) {
        setCodeError("Code nicht gefunden. Bitte beim Absender nachfragen.");
        return;
      }
      onLogin(participant);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Ich bin Teilnehmer</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-2.5 text-sm text-muted-foreground">
          Gib den Zugangscode aus deiner Einladung ein.
        </p>
        <Label htmlFor="pcode">Zugangscode</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="pcode"
            className="max-w-[220px]"
            placeholder="z. B. K7M2QX"
            maxLength={10}
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void submit()}
          />
          <Button
            onClick={() => void submit()}
            disabled={checking || !code.trim()}
          >
            Training starten
          </Button>
        </div>
        {codeError ? (
          <p className="mt-1.5 text-sm text-destructive">{codeError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
