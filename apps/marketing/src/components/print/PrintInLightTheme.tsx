"use client";

import { useEffect } from "react";

/**
 * Paper is ivory whatever the screen is: for the length of a print the page
 * borrows the light palette, so ink colours and every `dark:` variant come
 * out as designed instead of as pale text the browser darkens on its own.
 * next-themes only writes the class when the theme changes, so taking it for
 * the print and handing it back afterwards doesn't fight it. Transitions are
 * frozen for the swap both ways, or the sheet could be laid out mid-fade.
 */
export function PrintInLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    let restore: (() => void) | null = null;

    function before() {
      if (restore) return;
      const wasDark = root.classList.contains("dark");
      const wasLight = root.classList.contains("light");
      const colorScheme = root.style.colorScheme;
      const freeze = document.createElement("style");
      freeze.textContent = "*,*::before,*::after{transition:none!important}";
      document.head.appendChild(freeze);
      root.classList.remove("dark");
      root.classList.add("light");
      root.style.colorScheme = "light";
      restore = () => {
        root.classList.toggle("dark", wasDark);
        root.classList.toggle("light", wasLight);
        root.style.colorScheme = colorScheme;
        void window.getComputedStyle(root).color;
        freeze.remove();
      };
    }
    function after() {
      restore?.();
      restore = null;
    }

    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
