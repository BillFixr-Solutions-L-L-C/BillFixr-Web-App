import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deliberately whitelists exactly these columns — profiles_update_own_or_admin's
// RLS `using` clause allows a customer to update any column on their own row
// (see the migration comment for the pre-existing gap this route works
// around at the app layer, on top of the RLS-level fix). Never spread an
// arbitrary request body into `.update()` here.
export async function POST(request: Request) {
  const { name, address, city, postalCode, country } = await request.json();

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof address !== "string" ||
    !address.trim() ||
    typeof city !== "string" ||
    !city.trim() ||
    typeof postalCode !== "string" ||
    !postalCode.trim() ||
    typeof country !== "string" ||
    !country.trim()
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      postal_code: postalCode.trim(),
      country: country.trim(),
    })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
