"use client";

import { useCallback, useEffect } from "react";

import type { AltchaWidgetElement } from "altcha/types/generic";

const CHALLENGE_URL = "/api/altcha";
// the puzzle takes about a second; give slow phones room before giving up
const SOLVE_TIMEOUT_MS = 30_000;

// asked once per page load: is the spam check on here (a key set on the server)?
let probe: Promise<boolean> | null = null;
function spamCheckOn() {
  probe ??= fetch(CHALLENGE_URL, { cache: "no-store" })
    .then(async (response) => {
      const body = (await response.json()) as { disabled?: boolean };
      return response.ok && !body.disabled;
    })
    .catch(() => {
      // try again next time rather than remember a network blip as "off"
      probe = null;
      return false;
    });
  return probe;
}

// One widget per page, however many forms use it: the contact page has three.
let widget: AltchaWidgetElement | null = null;
let mounting: Promise<void> | null = null;
let solved: string | null = null;
let users = 0;

function mount() {
  mounting ??= (async () => {
    if (!(await spamCheckOn())) return;
    await import("altcha");
    if (users === 0 || widget) return;
    const element = document.createElement("altcha-widget");
    element.setAttribute("challenge", CHALLENGE_URL);
    element.setAttribute("display", "invisible");
    element.setAttribute("auto", "onload");
    element.hidden = true;
    element.addEventListener("statechange", (event) => {
      const detail = (event as CustomEvent<{ state: string; payload?: string }>).detail;
      solved = detail.state === "verified" ? (detail.payload ?? null) : null;
    });
    document.body.appendChild(element);
    widget = element;
  })().finally(() => {
    mounting = null;
  });
  return mounting;
}

function unmount() {
  widget?.remove();
  widget = null;
  solved = null;
}

/**
 * The public forms' spam check (see lib/altcha.ts). While a form is on screen,
 * an invisible ALTCHA widget solves a puzzle in the background; the returned
 * function hands over that solution for one submission and starts on the
 * next. Nothing to click, no cookies. Resolves to `undefined` where the check
 * is off.
 */
export function useAltcha() {
  useEffect(() => {
    users += 1;
    void mount();
    return () => {
      users -= 1;
      if (users === 0) unmount();
    };
  }, []);

  return useCallback(async (): Promise<string | undefined> => {
    if (!(await spamCheckOn())) return undefined;
    await mount();

    let payload = solved;
    if (!payload && widget) {
      // not solved yet (or expired): solve now, and wait for it
      const result = await Promise.race([
        widget.verify().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SOLVE_TIMEOUT_MS)),
      ]);
      payload = result?.payload ?? null;
    }

    // a solution is good for one submission: start on the next one
    solved = null;
    if (widget) {
      widget.reset();
      void widget.verify().catch(() => {});
    }
    return payload ?? undefined;
  }, []);
}
