"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Which bottom bar owns the thumb zone on a phone, and whether one of them is
 * currently showing the AI dock button.
 *
 * This used to be two `body:has(...)` CSS rules. They matched the marker
 * element even while it was `display: none` — so a composer's action bar
 * stepping aside for the keyboard still hid both the bottom nav and the
 * header's AI button, leaving no way to open the dock at all. Registering the
 * bars as state instead means "present" only ever counts bars you can see.
 */
type Slot = "actionBar" | "aiDock";

const counts: Record<Slot, number> = { actionBar: 0, aiDock: 0 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function usePresent(slot: Slot): boolean {
  return useSyncExternalStore(
    subscribe,
    () => counts[slot] > 0,
    () => false,
  );
}

function useRegister(slot: Slot, active: boolean) {
  useEffect(() => {
    if (!active) return;
    counts[slot] += 1;
    for (const listener of listeners) listener();
    return () => {
      counts[slot] -= 1;
      for (const listener of listeners) listener();
    };
  }, [slot, active]);
}

/** A composer's action bar is on screen, so the bottom nav steps aside. */
export function useRegisterActionBar(active: boolean) {
  useRegister("actionBar", active);
}

export function useActionBarPresent() {
  return usePresent("actionBar");
}

/** A visible bottom bar is carrying the AI dock button. */
export function useRegisterAiSlot(active: boolean) {
  useRegister("aiDock", active);
}

export function useAiSlotPresent() {
  return usePresent("aiDock");
}
