import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAiHealth, getAiServiceConfig } from "@/lib/ai-service";

// Security audit finding (BACKEND-PLAN.md "Security plan", Medium): this
// was fully unauthenticated and echoed the raw internal error message
// (which can include connection/hostname details) to any caller. Gated
// to admins, same as the rest of this app's diagnostic/ops surfaces —
// not called from any page today, so this doesn't break an existing
// flow. The real error still goes to the server log; the client only
// ever gets a generic message.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!getAiServiceConfig()) {
    return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });
  }

  try {
    const health = await getAiHealth();
    return NextResponse.json(health);
  } catch (error) {
    console.error("AI service health check failed:", error);
    return NextResponse.json({ error: "Failed to reach the AI service." }, { status: 502 });
  }
}
