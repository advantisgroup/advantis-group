"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useConvex } from "convex/react";

import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ACADEMY_ID } from "./use-academy-progress";

export function AdminLogin({ onLogin }: { onLogin: (pin?: string) => void }) {
  const isAdmin = useIsAdmin();
  const convex = useConvex();

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit() {
    setChecking(true);
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
      onLogin(pin);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Admin-Bereich</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isAdmin ? (
          <>
            <p className="mb-2.5 text-sm text-muted-foreground">
              Du bist Intranet-Admin und hast automatisch Zugriff, ohne PIN.
            </p>
            <Button onClick={() => onLogin()}>Trainer-Bereich öffnen</Button>
          </>
        ) : (
          <>
            <p className="mb-2.5 text-sm text-muted-foreground">
              Teilnehmer anlegen, Einladungen erstellen, Ergebnisse und Fragen einsehen.
            </p>
            <Label htmlFor="apin">Admin-PIN</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="apin"
                type="password"
                className="max-w-[220px]"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
              <Button onClick={() => void submit()} disabled={checking || !pin.trim()}>
                Anmelden
              </Button>
            </div>
            {pinError ? <p className="mt-1.5 text-sm text-destructive">{pinError}</p> : null}
            <p className="mt-2 text-sm text-muted-foreground">
              Standard-PIN: 1234 (im Admin-Bereich änderbar).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
