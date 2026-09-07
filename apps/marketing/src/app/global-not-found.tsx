import { JetBrains_Mono, Manrope, Outfit } from "next/font/google";

import "./global.css";
import { type Metadata } from "next";

import GlobalNotFoundClient from "@/components/layout/GlobalNotFoundClient";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: "Page not found — ADVANTIS GROUP",
  description: "The page you are looking for does not exist or may have moved.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${manrope.variable} ${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background antialiased">
        <GlobalNotFoundClient />
      </body>
    </html>
  );
}
