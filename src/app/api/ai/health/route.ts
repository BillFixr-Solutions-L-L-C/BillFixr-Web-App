import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { configuredBackends, getStackHealth } from "@/lib/aiStack";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";

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
  if (!hasDomainAccess(await getDomainAccess(supabase, "ai_pipeline"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Both backends are reported, each with its own state, so an admin can
  // see which half of the stack is down instead of one red light for the
  // pair. getStackHealth never throws — a backend that fails comes back
  // as unreachable — so the only 503 left is "nothing is set up at all".
  if (configuredBackends().length === 0) {
    return NextResponse.json({ error: "No AI backend is configured." }, { status: 503 });
  }

  const backends = await getStackHealth();
  const anyReachable = backends.some((b) => b.reachable);
  return NextResponse.json({ backends }, { status: anyReachable ? 200 : 502 });
}
