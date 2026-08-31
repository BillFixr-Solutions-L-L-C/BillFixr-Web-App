import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called right when SignUpForm shows "Check your email" — registers a
// pairing row for this specific just-created (still unconfirmed) user so
// this device can later poll for confirmation happening elsewhere. The
// returned id is the only thing that identifies this polling session; it
// is never sent anywhere except back to this same browser.
export async function POST(request: Request) {
  const { userId } = await request.json();
  if (typeof userId !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (!authUser?.user || authUser.user.email_confirmed_at) {
    return NextResponse.json({ error: "not eligible" }, { status: 400 });
  }

  const { data: pairing, error } = await admin
    .from("signup_pairings")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error || !pairing) {
    return NextResponse.json({ error: error?.message ?? "failed to start pairing" }, { status: 500 });
  }

  return NextResponse.json({ pairingId: pairing.id });
}
