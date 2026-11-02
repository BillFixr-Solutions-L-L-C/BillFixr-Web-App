"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOutAndRecord } from "@/lib/signOut";
import ConfirmModal from "@/components/ConfirmModal";

// Idle timeout for a signed-in session: a forgotten-open or stolen tab
// should not stay valid indefinitely. Supabase's own [auth.sessions]
// config is project-wide and cannot differ per role, so this is enforced
// at the app layer, mounted by each shell with its own duration.
//
// Admins are held to a much shorter window than customers because of
// what an admin tab can reach — every customer's bills, payments and
// personal details — whereas a customer's own session only ever exposes
// their own case.
export const ADMIN_IDLE_MS = 30 * 60 * 1000;
export const CUSTOMER_IDLE_MS = 90 * 60 * 1000;

// Long enough to notice and react, short enough that it is not a second
// idle period of its own. Counted inside the timeout, not added to it:
// the warning appears at timeoutMs - WARNING_MS so a 90-minute timeout
// signs out at 90 minutes, not 91.
const WARNING_MS = 60 * 1000;

export default function IdleTimeout({ timeoutMs }: { timeoutMs: number }) {
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
    setShowWarning(false);
    const supabase = createClient();
    try {
      await signOutAndRecord(supabase);
    } catch {
      // Best-effort — e.g. no network (a laptop woken up offline after
      // sitting idle overnight, past the threshold, is exactly when this
      // fires). Without this, the failed signOut() call would
      // throw before ever reaching the redirect below, leaving the
      // warning modal stuck open indefinitely instead of routing to
      // login once connectivity (or just the next navigation) works.
    }
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
    idleTimer.current = setTimeout(startWarning, timeoutMs - WARNING_MS);
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
  }, [timeoutMs]);

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
