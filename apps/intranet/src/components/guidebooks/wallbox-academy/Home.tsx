"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useConvex } from "convex/react";

import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ACADEMY_ID } from "./use-academy-progress";

export function Home({
  onParticipantLogin,
  onAdminLogin,
}: {
  onParticipantLogin: (participant: {
    id: Id<"academyParticipants">;
    name: string;
  }) => void;
  onAdminLogin: () => void;
}) {
  const isAdmin = useIsAdmin();
  const convex = useConvex();

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [checkingPin, setCheckingPin] = useState(false);

  async function submitCode() {
    setCheckingCode(true);
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
        setCodeError("Code nicht gefunden. Bitte beim Admin nachfragen.");
        return;
      }
      onParticipantLogin(participant);
    } finally {
      setCheckingCode(false);
    }
  }

  async function submitPin() {
    setCheckingPin(true);
    setPinError("");
    try {
      const ok = await convex.query(api.academySettings.checkPin, {
        academyId: ACADEMY_ID,
        pin,
      });
      if (!ok) {
        setPinError("Falsche PIN.");
        return;
      }
      onAdminLogin();
    } finally {
      setCheckingPin(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
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
              onKeyDown={e => e.key === "Enter" && void submitCode()}
            />
            <Button
              onClick={() => void submitCode()}
              disabled={checkingCode || !code.trim()}
            >
              Training starten
            </Button>
          </div>
          {codeError ? (
            <p className="mt-1.5 text-sm text-destructive">{codeError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin-Bereich</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isAdmin ? (
            <>
              <p className="mb-2.5 text-sm text-muted-foreground">
                Du bist Intranet-Admin und hast automatisch Zugriff, ohne PIN.
              </p>
              <Button onClick={onAdminLogin}>Trainer-Bereich öffnen</Button>
            </>
          ) : (
            <>
              <p className="mb-2.5 text-sm text-muted-foreground">
                Teilnehmer anlegen, Einladungen erstellen, Ergebnisse und Fragen
                einsehen.
              </p>
              <Label htmlFor="apin">Admin-PIN</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="apin"
                  type="password"
                  className="max-w-[220px]"
                  placeholder="PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && void submitPin()}
                />
                <Button
                  onClick={() => void submitPin()}
                  disabled={checkingPin || !pin.trim()}
                >
                  Anmelden
                </Button>
              </div>
              {pinError ? (
                <p className="mt-1.5 text-sm text-destructive">{pinError}</p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                Standard-PIN: 1234 (im Admin-Bereich änderbar).
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
