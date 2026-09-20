"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useConvex } from "convex/react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";

import { ACADEMY_ID } from "./use-academy-progress";

/** Participant entry: an access code is the whole credential — no intranet
 * account needed, so external invitees (candidates, partners, ...) can take
 * the training too, same as the original standalone tool.
 *
 * Treated like a verification code rather than a text field: one large,
 * letter-spaced, auto-uppercasing input. Someone is copying six characters out
 * of an email, often on a phone. */
export function ParticipantLogin({
  onLogin,
}: {
  onLogin: (participant: { id: Id<"academyParticipants">; name: string }) => void;
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
    if (!code.trim() || checking) return;
    setChecking(true);
    setCodeError("");
    try {
      const participant = await convex.query(api.academy.participants.findByCode, {
        academyId: ACADEMY_ID,
        code,
      });
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
    <div className="space-y-3">
      <label htmlFor="pcode" className="block text-sm font-medium">
        Zugangscode aus deiner Einladung
      </label>
      <Input
        id="pcode"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="K7M2QX"
        maxLength={10}
        value={code}
        aria-invalid={!!codeError}
        aria-describedby={codeError ? "pcode-error" : undefined}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase());
          setCodeError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        className="h-14 max-w-xs text-center font-mono text-2xl tracking-[0.35em] placeholder:tracking-[0.35em] placeholder:text-muted-foreground/40"
      />
      {codeError ? (
        <p id="pcode-error" className="text-sm text-destructive">
          {codeError}
        </p>
      ) : null}
      <Button size="lg" disabled={checking || !code.trim()} onClick={() => void submit()}>
        {checking ? <Loader2 className="size-4 animate-spin" /> : null}
        Training starten
      </Button>
    </div>
  );
}
