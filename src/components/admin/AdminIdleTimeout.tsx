"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ConfirmModal";

// Admin sessions get a real idle timeout — a stolen/forgotten-open admin
// tab shouldn't stay valid indefinitely. Supabase's own [auth.sessions]
// config is project-wide (applies to customers too), so this is enforced
// at the app layer instead, scoped to just the admin shell.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 60 * 1000;

export default function AdminIdleTimeout() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_MS / 1000);
  const showWarningRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countdownInterval = useRef<ReturnType<typeof setInterval>>(undefined);

  function clearAllTimers() {
    clearTimeout(idleTimer.current);
    clearTimeout(logoutTimer.current);
    clearInterval(countdownInterval.current);
  }

  async function signOutForInactivity() {
    clearAllTimers();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?error=inactivity_timeout");
    router.refresh();
  }

  function startWarning() {
    showWarningRef.current = true;
    setShowWarning(true);
    setSecondsLeft(WARNING_MS / 1000);
    countdownInterval.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    logoutTimer.current = setTimeout(signOutForInactivity, WARNING_MS);
  }

  function scheduleIdleCheck() {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(startWarning, IDLE_TIMEOUT_MS - WARNING_MS);
  }

  function stayLoggedIn() {
    clearAllTimers();
    showWarningRef.current = false;
    setShowWarning(false);
    scheduleIdleCheck();
  }

  useEffect(() => {
    // Ignores activity while the warning modal is up — reaching for the
    // mouse to click a button in the modal shouldn't silently dismiss it;
    // only the explicit "Stay Signed In" click should.
    function handleActivity() {
      if (showWarningRef.current) return;
      scheduleIdleCheck();
    }

    scheduleIdleCheck();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, handleActivity));

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ConfirmModal
      open={showWarning}
      title="Still there?"
      message={`You'll be signed out in ${secondsLeft}s due to inactivity.`}
      confirmLabel="Stay Signed In"
      cancelLabel="Log Out Now"
      onConfirm={stayLoggedIn}
      onCancel={signOutForInactivity}
    />
  );
}
