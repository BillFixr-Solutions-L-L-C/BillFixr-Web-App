import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Polled by the device that started signup. Once /auth/confirm marks a
// pairing "confirmed" (see there) with a fresh magic-link token attached,
// this hands that token back exactly once — the caller then does a real
// navigation to /auth/confirm?type=magiclink with it, which independently
// establishes its own session through the normal verifyOtp path. Nothing
// here issues a session directly.
export async function GET(request: Request) {
  const pairingId = new URL(request.url).searchParams.get("id");
  if (!pairingId) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: pairing } = await admin
    .from("signup_pairings")
    .select("status, magic_token_hash, expires_at")
    .eq("id", pairingId)
    .single();

  if (!pairing || new Date(pairing.expires_at) < new Date()) {
    return NextResponse.json({ status: "expired" });
  }

  if (pairing.status !== "confirmed" || !pairing.magic_token_hash) {
    return NextResponse.json({ status: "pending" });
  }

  // Single-use: mark consumed before handing the token back, so a second
  // poll (or a retried fetch) can't fetch the same token twice.
  await admin.from("signup_pairings").update({ status: "consumed" }).eq("id", pairingId);

  return NextResponse.json({ status: "confirmed", tokenHash: pairing.magic_token_hash });
}
