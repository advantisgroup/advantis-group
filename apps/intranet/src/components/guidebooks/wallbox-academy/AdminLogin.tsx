"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useConvex } from "convex/react";

import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      const ok = await convex.query(api.academy.settings.checkPin, {
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
    <div className="mx-auto max-w-md py-10">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Trainer-Bereich</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Teilnehmer anlegen, Einladungen erstellen, Ergebnisse und Fragen einsehen.
      </p>

      {isAdmin ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-muted-foreground">
            Du bist Intranet-Admin und hast automatisch Zugriff.
          </p>
          <Button onClick={() => onLogin()}>Öffnen</Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <label htmlFor="apin" className="block text-sm font-medium">
            Admin-PIN
          </label>
          {/* The PIN is a shared secret, so it isn't printed next to the field
              it unlocks any more — a trainer who needs it asks an admin. */}
          <Input
            id="apin"
            type="password"
            autoComplete="off"
            placeholder="••••"
            value={pin}
            aria-invalid={!!pinError}
            aria-describedby={pinError ? "apin-error" : undefined}
            onChange={(e) => {
              setPin(e.target.value);
              setPinError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            className="h-11 max-w-[200px] text-center font-mono text-lg tracking-[0.3em]"
          />
          {pinError ? (
            <p id="apin-error" className="text-sm text-destructive">
              {pinError}
            </p>
          ) : null}
          <Button disabled={checking || !pin.trim()} onClick={() => void submit()}>
            Anmelden
          </Button>
        </div>
      )}
    </div>
  );
}
