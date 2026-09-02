"use client";

import { useEffect } from "react";

/**
 * Mirrors the active locale into localStorage. Read back by `useEmailSubmit`
 * so a submitted form is answered in the language it was filled in.
 */
export function RememberLocale({ locale }: { locale: string }) {
  useEffect(() => {
    window.localStorage.setItem("NEXT_LOCALE", locale);
  }, [locale]);

  return null;
}
