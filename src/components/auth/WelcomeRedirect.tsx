"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export default function WelcomeRedirect() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // By the time this page loads, /auth/confirm has already verified the
    // token and established the session server-side — nothing left to
    // exchange here, just send the welcome email once and move on.
    (async () => {
      await fetch("/api/auth/welcome-email", { method: "POST" }).catch(() => {});
      router.push("/dashboard");
      router.refresh();
    })();
  }, [router]);

  const t = useT();
  return <p className="mt-8 text-sm text-gray-500">{t("auth.settingUp")}</p>;
}
