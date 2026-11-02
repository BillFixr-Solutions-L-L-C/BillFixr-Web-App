import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Stamps profiles.last_logout_at for the caller, just before they sign
// out. Supabase Auth records last_sign_in_at but has no sign-out
// equivalent, so this is the only way the app learns about one.
//
// The timestamp is taken here, not from the request: a client that could
// name its own logout time could name any time. The row written is the
// caller's own, from their session — the body is not read at all, so
// there is nothing to pass that could point this at someone else.
//
// Written with the service role rather than by giving customers UPDATE
// on profiles. That table has had privilege gaps closed more than once,
// and one narrow server route is a smaller surface than a new policy.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed out, or never signed in. Not an error worth reporting
  // to a client that is on its way out anyway.
  if (!user) {
    return NextResponse.json({ ok: true, recorded: false });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ last_logout_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    // Logged, not thrown. Failing to note a logout must never be a
    // reason someone cannot log out.
    console.error("Could not record logout for", user.id, error);
    return NextResponse.json({ ok: false, recorded: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recorded: true });
}
