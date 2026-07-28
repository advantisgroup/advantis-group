"use client";

import { useRouter } from "next/navigation";

import { AdminLogin } from "@/components/guidebooks/wallbox-academy/AdminLogin";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { Link } from "@/components/Link";

export default function WallboxAcademyAdminHomePage() {
  const router = useRouter();
  const { loginAdmin } = useAcademySession();

  return (
    <div className="space-y-4">
      <AdminLogin
        onLogin={(pin) => {
          loginAdmin(pin);
          router.push("/guidebooks/wallbox-sales-academy/admin/teilnehmer");
        }}
      />
      <p className="text-center text-sm text-muted-foreground">
        Möchtest du das Training selbst absolvieren? Nutze deinen Zugangscode auf der{" "}
        <Link href="/wallbox-sales-academy" className="underline">
          öffentlichen Teilnehmerseite
        </Link>
        .
      </p>
    </div>
  );
}
